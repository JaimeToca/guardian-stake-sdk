import type { Hex, PublicClient } from "viem";
import { type Logger, NoopLogger, type BroadcastServiceContract } from "@guardian/sdk";

/**
 * Service responsible for broadcasting signed transactions to the BSC/EVM network.
 */
export class BroadcastService implements BroadcastServiceContract {
  constructor(
    private readonly client: PublicClient,
    private readonly logger: Logger = new NoopLogger()
  ) {}

  async broadcast(rawTx: string): Promise<string> {
    this.logger.debug(`Broadcasting transaction: ${rawTx}`);
    const txHash = await this.client.sendRawTransaction({ serializedTransaction: rawTx as Hex });
    this.logger.debug(`Transaction broadcasted with hash: ${txHash}`);
    return txHash;
  }
}
