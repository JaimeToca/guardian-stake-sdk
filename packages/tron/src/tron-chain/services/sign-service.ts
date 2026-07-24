import type {
  BaseSignArgs,
  CompileArgs,
  Logger,
  PrehashResult,
  SigningWithPrivateKey,
} from "@guardian-sdk/sdk";
import { NoopLogger, SigningError, privateKey as validatePrivateKey } from "@guardian-sdk/sdk";
import type { TronWeb } from "tronweb";
import { utils as tronUtils } from "tronweb";
import type { TronWebFactory } from "../tronweb/tronweb-factory";
import { buildUnsignedTx } from "../tx/tx-builder";
import type { TronSignArgs, UnsignedTronTx } from "../tx/tron-types";

/** Narrow shape of a `raw_data.contract[].parameter.value` that carries `owner_address` — every
 * Tron contract type used here (FreezeBalanceV2, UnfreezeBalanceV2, Vote, WithdrawExpireUnfreeze,
 * WithdrawBalance) has one. Kept structural/`unknown`-narrowed rather than `any`. */
interface TronContractValue {
  owner_address?: unknown;
}
interface TronContractEntry {
  parameter?: { value?: TronContractValue };
}
interface TronRawData {
  contract?: TronContractEntry[];
}

function extractOwnerAddressHex(rawTx: UnsignedTronTx): string | undefined {
  const rawData = rawTx.raw_data as TronRawData | undefined;
  const owner = rawData?.contract?.[0]?.parameter?.value?.owner_address;
  return typeof owner === "string" ? owner : undefined;
}

/** `trx.sign` is generic over TronWeb's own concrete `Transaction`/`SignedTransaction` shape,
 * which isn't exported from the package's public entrypoint. Narrow our opaque `UnsignedTronTx`
 * (built via `buildUnsignedTx`) through `unknown` — the same pattern as tx-builder's `asUnsignedTx` —
 * rather than reaching into TronWeb's internal `lib/esm/types` paths or using `any`. */
type TronWebSignFn = TronWeb["trx"]["sign"];
const asTronWebSignInput = (v: UnsignedTronTx): Parameters<TronWebSignFn>[0] =>
  v as unknown as Parameters<TronWebSignFn>[0];

export function createSignService(
  tronWebFactory: TronWebFactory,
  logger: Logger = new NoopLogger()
) {
  return {
    async sign(args: SigningWithPrivateKey): Promise<string> {
      logger.info("SignService: signing transaction", { type: args.transaction.type });

      if (typeof args.privateKey !== "string" || !args.privateKey)
        throw new SigningError("INVALID_SIGNING_ARGS", "Tron sign() requires a privateKey.");

      // Normalize using the shared validator (same as BSC):
      // - accepts with or without 0x prefix
      // - validates 64 hex chars + valid secp256k1 range
      // Then strip the 0x because TronWeb rejects prefixed keys.
      const validated = validatePrivateKey(args.privateKey);
      const tronPrivateKey = validated.slice(2);

      const tronWeb = tronWebFactory.create(tronPrivateKey);
      const owner = tronWeb.defaultAddress.base58 as string;
      if (!owner)
        throw new SigningError(
          "INVALID_SIGNING_ARGS",
          "Could not derive an owner address from the provided private key."
        );
      const unsigned = await buildUnsignedTx(tronWeb, args.transaction, owner);
      const signed = await tronWeb.trx.sign(asTronWebSignInput(unsigned));

      logger.info("SignService: transaction signed");
      return JSON.stringify(signed);
    },

    async prehash(args: BaseSignArgs): Promise<PrehashResult> {
      logger.info("SignService: prehashing transaction", { type: args.transaction.type });

      const tronWeb = tronWebFactory.create();
      const owner = (args.transaction.account ?? "") as string;
      if (!owner)
        throw new SigningError(
          "INVALID_SIGNING_ARGS",
          "Tron prehash() requires transaction.account (the owner address)."
        );
      const unsigned = await buildUnsignedTx(tronWeb, args.transaction, owner);
      // Thread the fully-built unsigned tx through `_rawTx` (a Tron-only extension) so compile()
      // can reattach the external signature without rebuilding or re-hitting the FullNode — mirrors
      // Cardano's `_txBodyCbor`.
      const signArgs: TronSignArgs = {
        transaction: args.transaction,
        fee: args.fee,
        nonce: args.nonce,
        _rawTx: unsigned,
      };

      logger.info("SignService: prehash complete — send serializedTransaction to external signer");
      // `serializedTransaction` is the txID itself — SHA256(raw_data), the exact secp256k1 digest
      // (NOT Ed25519) the external signer must sign. It is not the serialized tx.
      return { serializedTransaction: unsigned.txID, signArgs };
    },

    async compile(args: CompileArgs): Promise<string> {
      logger.info("SignService: compiling signed transaction");

      const rawTx = (args.signArgs as TronSignArgs)._rawTx as UnsignedTronTx | undefined;
      if (!rawTx)
        throw new SigningError(
          "INVALID_SIGNING_ARGS",
          "compile() requires signArgs._rawTx from prehash()."
        );
      if (typeof args.signature !== "string" || args.signature.length === 0)
        throw new SigningError("INVALID_SIGNING_ARGS", "compile() requires a non-empty signature.");
      if (typeof rawTx.raw_data_hex !== "string" || rawTx.raw_data_hex.length === 0)
        throw new SigningError(
          "INVALID_SIGNING_ARGS",
          "compile() requires signArgs._rawTx.raw_data_hex from prehash()."
        );

      // Integrity check: recompute SHA256(raw_data) and assert it equals the txID that was
      // returned to the external signer by prehash(). This catches a `_rawTx` swapped (or
      // mutated) between prehash() and compile() before it ever reaches an "attach signature"
      // step — without it, a tampered raw_data would silently carry over the STALE txID and the
      // signature would be attached to a transaction the signer never actually reviewed.
      const recomputedTxId = Buffer.from(
        tronUtils.crypto.SHA256(Array.from(Buffer.from(rawTx.raw_data_hex, "hex")))
      ).toString("hex");
      if (recomputedTxId !== rawTx.txID)
        throw new SigningError(
          "SIGNATURE_MISMATCH",
          "compile() detected that signArgs._rawTx does not match its own txID " +
            "(SHA256(raw_data) != txID). This means _rawTx was mutated or swapped after prehash()."
        );

      // Signature check: recover the secp256k1 signer from the txID digest and confirm it equals
      // the transaction's own owner_address. This catches a syntactically valid signature that
      // simply belongs to the wrong key/tx, which would otherwise only be caught (or silently
      // accepted) at broadcast.
      const ownerAddressHex = extractOwnerAddressHex(rawTx);
      if (!ownerAddressHex)
        throw new SigningError(
          "INVALID_SIGNING_ARGS",
          "compile() could not find raw_data.contract[0].parameter.value.owner_address on signArgs._rawTx."
        );
      let recoveredAddressHex: string;
      try {
        recoveredAddressHex = tronUtils.crypto.ecRecover(rawTx.txID, args.signature);
      } catch {
        throw new SigningError(
          "SIGNATURE_MISMATCH",
          "compile() could not recover a secp256k1 signer from the supplied signature over txID."
        );
      }
      if (recoveredAddressHex.toLowerCase() !== ownerAddressHex.toLowerCase())
        throw new SigningError(
          "SIGNATURE_MISMATCH",
          "compile() produced a transaction whose signature does not recover to the transaction's " +
            "owner_address. This can mean signArgs was mutated after prehash(), or the supplied " +
            "signature belongs to a different signer/transaction."
        );

      // Attach the external signature onto the prehash-built raw tx. Tron carries signatures in a
      // `signature[]` array; a single freeze/vote/unfreeze/withdraw tx has exactly one signer.
      const signed: UnsignedTronTx = { ...rawTx, signature: [args.signature] };

      logger.info("SignService: transaction compiled");
      return JSON.stringify(signed);
    },
  };
}
