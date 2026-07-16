import type {
  BaseSignArgs,
  CompileArgs,
  Logger,
  PrehashResult,
  SigningWithPrivateKey,
} from "@guardian-sdk/sdk";
import { NoopLogger, SigningError, privateKey as validatePrivateKey } from "@guardian-sdk/sdk";
import type { TronWeb } from "tronweb";
import type { TronWebFactory } from "../tronweb/tronweb-factory";
import { buildUnsignedTx } from "../tx/tx-builder";
import type { TronSignArgs, UnsignedTronTx } from "../tx/tron-types";

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
      // Attach the external signature onto the prehash-built raw tx. Tron carries signatures in a
      // `signature[]` array; a single freeze/vote/unfreeze/withdraw tx has exactly one signer.
      const signed: UnsignedTronTx = { ...rawTx, signature: [args.signature] };

      logger.info("SignService: transaction compiled");
      return JSON.stringify(signed);
    },
  };
}
