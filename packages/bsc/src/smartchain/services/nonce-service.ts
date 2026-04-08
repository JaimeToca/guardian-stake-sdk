import type { PublicClient } from "viem";
import type { NonceServiceContract } from "@guardian-sdk/sdk";
import { parseEvmAddress } from "../validations";

/**
 * Service responsible for retrieving transaction nonces for blockchain addresses.
 */
export class NonceService implements NonceServiceContract {
  constructor(private readonly client: PublicClient) {}

  getNonce(address: string): Promise<number> {
    const evmAddress = parseEvmAddress(address);

    return this.client.getTransactionCount({
      address: evmAddress,
    });
  }
}
