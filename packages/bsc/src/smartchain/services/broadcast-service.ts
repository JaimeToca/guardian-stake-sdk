import type { Hex, PublicClient } from "viem";
import type { Logger } from "@guardian-sdk/sdk";
import { NoopLogger } from "@guardian-sdk/sdk";

export async function broadcast(
  client: PublicClient,
  logger: Logger = new NoopLogger(),
  rawTx: string
): Promise<string> {
  logger.debug(`Broadcasting transaction: ${rawTx}`);
  const txHash = await client.sendRawTransaction({ serializedTransaction: rawTx as Hex });
  logger.debug(`Transaction broadcasted with hash: ${txHash}`);
  return txHash;
}
