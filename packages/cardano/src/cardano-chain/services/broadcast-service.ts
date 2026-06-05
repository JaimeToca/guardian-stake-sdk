import type { BroadcastServiceContract, Logger } from "@guardian-sdk/sdk";
import { NoopLogger } from "@guardian-sdk/sdk";
import type { BlockfrostRpcClientContract } from "../rpc/blockfrost-rpc-client-contract";

/**
 * Submits a signed Cardano transaction (CBOR hex) via the Blockfrost API.
 */
export function createBroadcastService(
  rpcClient: BlockfrostRpcClientContract,
  logger: Logger = new NoopLogger()
): BroadcastServiceContract {
  return {
    async broadcast(rawTx: string): Promise<string> {
      logger.debug("BroadcastService: submitting Cardano transaction");

      const txHash = await rpcClient.submitTx(rawTx);

      logger.debug("BroadcastService: transaction submitted", { txHash });
      return txHash;
    },
  };
}
