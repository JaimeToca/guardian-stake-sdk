import type { Logger } from "@guardian-sdk/sdk";
import { NoopLogger } from "@guardian-sdk/sdk";
import type { TronRpcClientContract } from "../rpc/tron-rpc-client-contract";

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
