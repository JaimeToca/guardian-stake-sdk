import type { PublicClient } from "viem";
import { parseEvmAddress } from "../validations";

export function getNonce(client: PublicClient, address: string): Promise<number> {
  return client.getTransactionCount({ address: parseEvmAddress(address) });
}
