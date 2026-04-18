import type { BroadcastServiceContract, Logger } from "@guardian-sdk/sdk";
import { NoopLogger } from "@guardian-sdk/sdk";
import type { BlockfrostRpcClientContract } from "../rpc/blockfrost-rpc-client-contract";

/**
 * Submits a signed Cardano transaction (CBOR hex) via the Blockfrost API.
 */
export class BroadcastService implements BroadcastServiceContract {
  constructor(
    private readonly rpcClient: BlockfrostRpcClientContract,
    private readonly logger: Logger = new NoopLogger()
  ) {}

  async broadcast(rawTx: string): Promise<string> {
    this.logger.debug("BroadcastService: submitting Cardano transaction");
    const txHash = await this.rpcClient.submitTx(rawTx);
    this.logger.debug("BroadcastService: transaction submitted", { txHash });
    return txHash;
  }
}
