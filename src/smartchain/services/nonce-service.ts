import { Address, PublicClient } from "viem";
import { NonceServiceContract } from "../../common/service/nonce-service-contract";

/**
 * Service responsible for managing and retrieving transaction nonces for blockchain addresses.
 * The nonce is a crucial part of transaction management in Ethereum-like blockchains,
 * ensuring transactions are processed in the correct order and preventing replay attacks.
 */
export class NonceService implements NonceServiceContract {
  /**
   * Constructs an instance of NonceService.
   * @param client An instance of PublicClient from viem, used to interact with the blockchain
   * and retrieve data like transaction counts.
   */
  constructor(private readonly client: PublicClient) {}

  /**
   * Retrieves the current transaction count (nonce) for a specified evm address.
   * This method uses the `getTransactionCount` function provided by the `PublicClient`
   * to query the blockchain.
   * @param address The blockchain address for which to fetch the nonce.
   * @returns A Promise that resolves to the numerical nonce of the given address.
   */
  getNonce(address: Address): Promise<number> {
    return this.client.getTransactionCount({
      address: address,
    });
  }
}
