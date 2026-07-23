import type { Logger } from "@guardian-sdk/sdk";
import { NoopLogger } from "@guardian-sdk/sdk";
import type { SolanaRpcClientContract } from "../rpc/solana-rpc-client-contract";

export interface SolanaBroadcastService {
  broadcast(rawTx: string): Promise<string>;
}

/**
 * Submits a base64 wire transaction via `sendTransaction`.
 * Returns the base58 transaction signature.
 */
export function createBroadcastService(
  rpc: SolanaRpcClientContract,
  logger: Logger = new NoopLogger()
): SolanaBroadcastService {
  return {
    async broadcast(rawTx: string): Promise<string> {
      logger.info("BroadcastService: broadcasting transaction");
      if (typeof rawTx !== "string" || rawTx.length === 0) {
        throw new Error("broadcast() requires a non-empty base64 wire transaction.");
      }
      const signature = await rpc.sendTransaction(rawTx);
      logger.info("BroadcastService: transaction broadcasted", { signature });
      return signature;
    },
  };
}
