/** Contract for a service responsible for retrieving transaction nonces. */
export interface NonceServiceContract {
  /**
   * Returns the current transaction nonce for a blockchain address.
   * @param address The blockchain address to fetch the nonce for.
   */
  getNonce(address: string): Promise<number>;
}
