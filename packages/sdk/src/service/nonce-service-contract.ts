/**
 * @interface NonceServiceContract
 * @description Defines the contract for a service responsible for retrieving transaction nonces.
 */
export interface NonceServiceContract {
  /**
   * @method getNonce
   * @description Retrieves the current transaction nonce for a specific blockchain address.
   * @param {string} address - The blockchain address for which to fetch the nonce.
   * @returns {Promise<number>} A promise that resolves to the current nonce value.
   */
  getNonce(address: string): Promise<number>;
}
