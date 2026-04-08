import { ValidationError } from "./errors";

const HEX_64_REGEX = /^[0-9a-fA-F]{64}$/;

const SECP256K1_ORDER = BigInt(
  "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141"
);

/**
 * A validated secp256k1 private key.
 *
 * The type extends `0x${string}` so it is directly usable with viem's
 * `privateKeyToAccount` and other EVM tooling — no conversion needed.
 *
 * Use `privateKey(value)` to construct. The function validates format and
 * value against the secp256k1 curve order, then returns a branded string.
 */
export type PrivateKey = `0x${string}` & { readonly _brand: "PrivateKey" };

/**
 * Validates and returns a secp256k1 private key as a branded hex string.
 *
 * Accepts keys with or without a `0x` prefix.
 *
 * @throws if the value is not 32 bytes of valid hex, is zero, or exceeds the curve order.
 */
export function privateKey(value: string): PrivateKey {
  const stripped = value.startsWith("0x") || value.startsWith("0X") ? value.slice(2) : value;

  if (!HEX_64_REGEX.test(stripped)) {
    throw new ValidationError(
      "INVALID_PRIVATE_KEY",
      "Invalid secp256k1 private key: expected 32 bytes (64 hex characters)"
    );
  }

  const keyValue = BigInt("0x" + stripped);

  if (keyValue === 0n) {
    throw new ValidationError("INVALID_PRIVATE_KEY", "Invalid secp256k1 private key: key cannot be zero");
  }

  if (keyValue >= SECP256K1_ORDER) {
    throw new ValidationError(
      "INVALID_PRIVATE_KEY",
      "Invalid secp256k1 private key: value exceeds curve order"
    );
  }

  return `0x${stripped.toLowerCase()}` as PrivateKey;
}
