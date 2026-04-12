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

/**
 * Cardano prehash (MPC / external signing) requires the staking public key upfront
 * so that the transaction body (which embeds certificates and withdrawals keyed by
 * the stake key hash) is built correctly before it is hashed and sent for signing.
 *
 * `serializedTransaction` in the returned `PrehashResult` is the Blake2b-256 hash of
 * the transaction body — the exact 32-byte (64 hex-char) preimage the external signer
 * must sign with Ed25519.
 */
export interface CardanoPrehashArgs extends BaseSignArgs {
  stakingPublicKey: string; // 32-byte Ed25519 public key as 64-char hex
}

export function isCardanoPrehashArgs(args: BaseSignArgs): args is CardanoPrehashArgs {
  return (
    "stakingPublicKey" in args && typeof (args as CardanoPrehashArgs).stakingPublicKey === "string"
  );
}
