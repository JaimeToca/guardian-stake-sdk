import type { BaseSignArgs } from "@guardian-sdk/sdk";

/**
 * Cardano signing requires two separate Ed25519 keys:
 * - `paymentPrivateKey`: authorizes spending the UTXOs (32-byte hex)
 * - `stakingPrivateKey`: authorizes delegation certificates and reward withdrawals (32-byte hex)
 *
 * Both keys must correspond to the stake address / payment address used in the transaction.
 */
export interface CardanoSigningWithPrivateKey extends BaseSignArgs {
  paymentPrivateKey: string; // 32-byte Ed25519 key as 64-char hex
  stakingPrivateKey: string; // 32-byte Ed25519 key as 64-char hex
}

export function isCardanoSigningWithPrivateKey(
  args: BaseSignArgs
): args is CardanoSigningWithPrivateKey {
  return (
    "paymentPrivateKey" in args &&
    typeof (args as CardanoSigningWithPrivateKey).paymentPrivateKey === "string" &&
    "stakingPrivateKey" in args &&
    typeof (args as CardanoSigningWithPrivateKey).stakingPrivateKey === "string"
  );
}
