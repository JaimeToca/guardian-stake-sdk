import type { Logger } from "@guardian-sdk/sdk";
import { NoopLogger } from "@guardian-sdk/sdk";
import type { TronRpcClientContract } from "../rpc/tron-rpc-client-contract";

/**
 * Thin wrapper over `rpc.broadcast` (`POST /wallet/broadcasttransaction`), returning the txid.
 * Rejection handling lives in the RPC client, not here: the FullNode answers a rejected broadcast
 * with HTTP 200 + `result: false`, so `rpc.broadcast` inspects the body and throws the node's own
 * `code` + decoded hex `message` — a thrown error here always means a real rejection, never HTTP 200.
 */
export function createBroadcastService(
  rpc: TronRpcClientContract,
  logger: Logger = new NoopLogger()
) {
  return {
    async broadcast(rawTx: string): Promise<string> {
      logger.info("BroadcastService: broadcasting transaction");
      const txid = await rpc.broadcast(rawTx);
      logger.info("BroadcastService: transaction broadcasted", { txid });
      return txid;
    },
  };
}
