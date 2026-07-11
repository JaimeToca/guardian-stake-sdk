import { Cardano } from "@cardano-sdk/core";
import { Ed25519KeyHashHex } from "@cardano-sdk/crypto";
import { assertIsHexString } from "@cardano-sdk/util";
import { ValidationError, SigningError } from "@guardian-sdk/sdk";

/**
 * Validates a Cardano payment address (addr1...).
 * Throws if the string is not a valid non-reward bech32 Cardano address.
 */
export function checkIfPaymentAddressIsValid(address: string) {
  const parsed = Cardano.Address.fromString(address);
  const type = parsed?.getType();
  if (
    !parsed ||
    type === Cardano.AddressType.RewardKey ||
    type === Cardano.AddressType.RewardScript
  ) {
    throw new ValidationError(
      "INVALID_ADDRESS",
      `Expected a payment address (addr1...), got: "${address}".`
    );
  }
  if (parsed.getNetworkId() !== Cardano.NetworkId.Mainnet) {
    throw new ValidationError(
      "INVALID_ADDRESS",
      `Expected a mainnet payment address (addr1...), got a testnet address: "${address}".`
    );
  }
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
  return Cardano.createRewardAccount(Ed25519KeyHashHex(stakeKeyHashHex), Cardano.NetworkId.Mainnet);
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

  if (parsed.getNetworkId() !== Cardano.NetworkId.Mainnet) {
    throw new ValidationError(
      "INVALID_ADDRESS",
      `Expected a mainnet address, got a testnet address: "${address}".`
    );
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
  return Cardano.createRewardAccount(Ed25519KeyHashHex(stakeCred.hash), Cardano.NetworkId.Mainnet);
}

/**
 * Extracts the payment and stake key-hash credentials (56-char hex) from a
 * Cardano base address (addr1q...).
 *
 * Staking transactions require a base address because both credentials must be
 * present: the payment credential authorizes spending the UTXOs, and the stake
 * credential authorizes the delegation certificates and reward withdrawals.
 * Enterprise/pointer/reward addresses are rejected — they cannot carry a full
 * staking transaction.
 *
 * @throws ValidationError("INVALID_ADDRESS") if `address` is not a base address.
 */
export function getBaseAddressCredentials(address: string): {
  paymentKeyHashHex: string;
  stakeKeyHashHex: string;
} {
  const base = Cardano.Address.fromString(address)?.asBase();
  if (!base) {
    throw new ValidationError(
      "INVALID_ADDRESS",
      `Cardano staking requires a base address (addr1q...) that carries a stake credential, got: "${address}".`
    );
  }
  return {
    paymentKeyHashHex: base.getPaymentCredential().hash,
    stakeKeyHashHex: base.getStakeCredential().hash,
  };
}

/**
 * Validates a Cardano Ed25519 private key.
 * Accepts a 32-byte (64 hex char) Ed25519 scalar as hex string.
 */
export function parseCardanoPrivateKey(value: string): string {
  const stripped = value.startsWith("0x") ? value.slice(2) : value;
  try {
    assertIsHexString(stripped, 64);
  } catch {
    throw new ValidationError(
      "INVALID_PRIVATE_KEY",
      "Cardano private key must be 32 bytes (64 hex characters)."
    );
  }
  return stripped;
}

/**
 * Validates a Cardano Ed25519 public key.
 * Accepts a 32-byte (64 hex char) Ed25519 public key as hex string.
 */
export function parseCardanoPublicKey(value: string): string {
  try {
    assertIsHexString(value, 64);
  } catch {
    throw new ValidationError(
      "INVALID_ADDRESS",
      "Cardano public key must be 32 bytes (64 hex characters)."
    );
  }
  return value;
}

/**
 * Parses a non-negative integer lovelace string from Blockfrost responses.
 * Throws ValidationError("INVALID_AMOUNT") for negative, fractional, or non-numeric strings.
 */
export function parseLovelaceString(value: string, fieldName: string): bigint {
  if (!/^\d+$/.test(value)) {
    throw new ValidationError(
      "INVALID_AMOUNT",
      `${fieldName} must be a non-negative integer string, got "${value}".`
    );
  }
  return BigInt(value);
}

/**
 * Asserts that `value` is a valid hex string of exactly `byteLength` bytes.
 * Throws SigningError("INVALID_SIGNING_ARGS") naming the field and expected size.
 */
export function assertHexBytes(value: string, byteLength: number, fieldName: string): void {
  try {
    assertIsHexString(value, byteLength * 2);
  } catch {
    throw new SigningError(
      "INVALID_SIGNING_ARGS",
      `${fieldName} must be ${byteLength} bytes (${byteLength * 2} hex characters), got ${value.length}.`
    );
  }
}
