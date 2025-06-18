import { Address } from "viem";

/**
 * @interface NonceServiceContract
 * @description Defines the contract for a service responsible for retrieving transaction nonces.
 * This interface ensures that any class implementing it will provide a standardized method
 * for fetching the next available nonce for a given blockchain address.
 */
export interface NonceServiceContract {
  /**
   * @method getNonce
   * @description Retrieves the current transaction nonce for a specific blockchain address.
   * The nonce is a sequentially increasing number used to prevent transaction replay attacks
   * and ensure the correct ordering of transactions originating from an address.
   * @param {Address} address - The blockchain address for which to fetch the nonce.
   * @returns {Promise<number>} A promise that resolves to the current nonce value.
   */
  getNonce(address: Address): Promise<number>;
}
