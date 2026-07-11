import type {
  BaseSignArgs,
  CompileArgs,
  PrehashResult,
  SigningWithPrivateKey,
} from "@guardian-sdk/sdk";
import { SigningError } from "@guardian-sdk/sdk";
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

export function createSignService(tronWebFactory: TronWebFactory) {
  return {
    async sign(args: SigningWithPrivateKey): Promise<string> {
      if (!args.privateKey)
        throw new SigningError("INVALID_SIGNING_ARGS", "Tron sign() requires a privateKey.");
      const tronWeb = tronWebFactory.create(args.privateKey);
      const owner = tronWeb.defaultAddress.base58 as string;
      if (!owner)
        throw new SigningError(
          "INVALID_SIGNING_ARGS",
          "Could not derive an owner address from the provided private key."
        );
      const unsigned = await buildUnsignedTx(tronWeb, args.transaction, owner);
      const signed = await tronWeb.trx.sign(asTronWebSignInput(unsigned));
      return JSON.stringify(signed);
    },

    async prehash(args: BaseSignArgs): Promise<PrehashResult> {
      const tronWeb = tronWebFactory.create();
      const owner = (args.transaction.account ?? "") as string;
      if (!owner)
        throw new SigningError(
          "INVALID_SIGNING_ARGS",
          "Tron prehash() requires transaction.account (the owner address)."
        );
      const unsigned = await buildUnsignedTx(tronWeb, args.transaction, owner);
      const signArgs: TronSignArgs = {
        transaction: args.transaction,
        fee: args.fee,
        nonce: args.nonce,
        _rawTx: unsigned,
      };
      return { serializedTransaction: unsigned.txID, signArgs };
    },

    async compile(args: CompileArgs): Promise<string> {
      const rawTx = (args.signArgs as TronSignArgs)._rawTx as UnsignedTronTx | undefined;
      if (!rawTx)
        throw new SigningError(
          "INVALID_SIGNING_ARGS",
          "compile() requires signArgs._rawTx from prehash()."
        );
      if (!args.signature)
        throw new SigningError("INVALID_SIGNING_ARGS", "compile() requires a non-empty signature.");
      const signed: UnsignedTronTx = { ...rawTx, signature: [args.signature] };
      return JSON.stringify(signed);
    },
  };
}
