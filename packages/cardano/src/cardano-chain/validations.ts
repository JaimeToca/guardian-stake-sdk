import { Cardano } from "@cardano-sdk/core";
import { Ed25519KeyHashHex } from "@cardano-sdk/crypto";
import { ValidationError } from "@guardian-sdk/sdk";

/** Ed25519 private key is 32 bytes = 64 hex characters. */
const HEX_64_REGEX = /^[0-9a-fA-F]{64}$/;

/**
 * Validates a Cardano payment address (addr1...).
 * Throws if the string is not a valid non-reward bech32 Cardano address.
 */
export function parsePaymentAddress(address: string): string {
  const parsed = Cardano.Address.fromString(address);
  if (
    !parsed ||
    parsed.getType() === Cardano.AddressType.RewardKey ||
    parsed.getType() === Cardano.AddressType.RewardScript
  ) {
    throw new ValidationError(
      "INVALID_ADDRESS",
      `Expected a payment address (addr1...), got: "${address}".`
    );
  }
  return address;
}

/**
 * Converts a pool bech32 ID (pool1...) to a 56-char hex string (28-byte key hash).
 * Throws if the string is not a valid pool ID.
 */
export function parsePoolId(poolId: string): string {
  try {
    const poolIdBranded = Cardano.PoolId(poolId);
    return Cardano.PoolId.toKeyHash(poolIdBranded);
  } catch {
    throw new ValidationError(
      "INVALID_ADDRESS",
      `"${poolId}" is not a valid Cardano pool ID (expected pool1...).`
    );
  }
}

/**
 * Builds a mainnet reward account bech32 string (stake1...) from a 28-byte
 * stake key hash given as a 56-char hex string.
 */
export function buildRewardAccount(stakeKeyHashHex: string): string {
  const keyHash = Ed25519KeyHashHex(stakeKeyHashHex);
  const rewardCred = { type: Cardano.CredentialType.KeyHash, hash: keyHash };
  const rewardAddr = Cardano.RewardAddress.fromCredentials(Cardano.NetworkId.Mainnet, rewardCred);
  return rewardAddr.toAddress().toBech32();
}

/**
 * Resolves any Cardano address to a mainnet stake address (stake1...).
 *
 * - If a stake/reward address is passed, it is returned as-is.
 * - If a base payment address (addr1q...) is passed, the stake credential is
 *   extracted from it and the corresponding stake address is returned.
 * - Enterprise or pointer addresses have no staking component — throws.
 */
export function resolveStakeAddress(address: string): string {
  const parsed = Cardano.Address.fromString(address);
  if (!parsed) {
    throw new ValidationError("INVALID_ADDRESS", `Cannot parse Cardano address: "${address}".`);
  }

  const type = parsed.getType();

  if (type === Cardano.AddressType.RewardKey || type === Cardano.AddressType.RewardScript) {
    return address;
  }

  const base = parsed.asBase();
  if (!base) {
    throw new ValidationError(
      "INVALID_ADDRESS",
      `Address "${address}" has no staking component. Provide a base address (addr1q...) or stake address (stake1...).`
    );
  }

  const stakeCred = base.getStakeCredential();
  const rewardAddr = Cardano.RewardAddress.fromCredentials(Cardano.NetworkId.Mainnet, stakeCred);
  return rewardAddr.toAddress().toBech32();
}

/**
 * Validates a Cardano Ed25519 private key.
 * Accepts a 32-byte (64 hex char) Ed25519 scalar as hex string.
 */
export function parseCardanoPrivateKey(value: string): string {
  const stripped = value.startsWith("0x") ? value.slice(2) : value;
  if (!HEX_64_REGEX.test(stripped)) {
    throw new ValidationError(
      "INVALID_PRIVATE_KEY",
      "Cardano private key must be 32 bytes (64 hex characters)."
    );
  }
  return stripped;
}
