import type { Logger } from "@guardian-sdk/sdk";
import { NoopLogger, SigningError } from "@guardian-sdk/sdk";
import type { SolanaRpcClientContract } from "../rpc/solana-rpc-client-contract";
import type { SolanaSendTransactionOptions } from "../tx/solana-types";

export interface SolanaBroadcastService {
  broadcast(rawTx: string): Promise<string>;
}

/**
 * Submits a base64 wire transaction via `sendTransaction`, forwarding the configured JSON-RPC
 * options (`skipPreflight`, `preflightCommitment`, `maxRetries`, `minContextSlot`). Returns the
 * base58 transaction signature.
 *
 * An expired blockhash surfaces as a `BroadcastError` with code `BLOCKHASH_EXPIRED` (when preflight
 * is on) — the caller catches it, re-signs (fresh blockhash), and rebroadcasts.
 */
export function createBroadcastService(
  rpc: SolanaRpcClientContract,
  options: SolanaSendTransactionOptions = {},
  logger: Logger = new NoopLogger()
): SolanaBroadcastService {
  return {
    async broadcast(rawTx: string): Promise<string> {
      logger.info("BroadcastService: broadcasting transaction", {
        skipPreflight: options.skipPreflight ?? false,
      });
      if (typeof rawTx !== "string" || rawTx.length === 0) {
        throw new SigningError(
          "INVALID_SIGNING_ARGS",
          "broadcast() requires a non-empty base64 wire transaction."
        );
      }
      const signature = await rpc.sendTransaction(rawTx, options);
      logger.info("BroadcastService: transaction broadcasted", { signature });
      return signature;
    },
  };
}
