/** Contract for a service responsible for broadcasting signed transactions. */
export interface BroadcastServiceContract {
  /**
   * Broadcasts a signed raw transaction to the network.
   * @param rawTx The signed raw transaction string, as returned by `sign()` or `compile()`.
   * @returns The transaction hash.
   */
  broadcast(rawTx: string): Promise<string>;
}
