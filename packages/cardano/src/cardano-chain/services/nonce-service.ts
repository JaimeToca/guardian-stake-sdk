import type { NonceServiceContract } from "@guardian-sdk/sdk";

/**
 * Cardano does not use account-based nonces.
 * Cardano uses a UTXO model — each transaction consumes specific UTXOs as inputs,
 * which inherently prevents double-spending without needing a nonce.
 *
 * This service always returns 0 to satisfy the `NonceServiceContract` interface.
 * The actual double-spend protection is handled by UTXO selection in the sign service.
 */
export class NonceService implements NonceServiceContract {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getNonce(_address: string): Promise<number> {
    return Promise.resolve(0);
  }
}
