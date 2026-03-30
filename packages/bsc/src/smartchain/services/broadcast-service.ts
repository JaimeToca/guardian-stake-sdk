import type { Hex, PublicClient } from "viem";
import type { BroadcastServiceContract } from "@guardian/sdk";

/**
 * Service responsible for broadcasting signed transactions to the BSC/EVM network.
 */
export class BroadcastService implements BroadcastServiceContract {
  constructor(private readonly client: PublicClient) {}

  broadcast(rawTx: string): Promise<string> {
    return this.client.sendRawTransaction({ serializedTransaction: rawTx as Hex });
  }
}
