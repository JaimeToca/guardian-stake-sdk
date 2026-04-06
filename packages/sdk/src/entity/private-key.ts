import type { HexString } from "./types";

const HEX_64_REGEX = /^[0-9a-fA-F]{64}$/;

const SECP256K1_ORDER = BigInt(
  "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141"
);

/**
 * The elliptic curve used by a private key.
 * Determines both the validation rules and the chains the key is compatible with.
 *
 * - Secp256k1: BSC, Ethereum, TRON, and most EVM-compatible chains.
 */
export type Curve = "secp256k1";

/**
 * A validated private key value object, curve-aware.
 *
 * Accepts keys with or without a `0x` prefix and validates format and value
 * according to the rules of the specified curve.
 *
 * Use `PrivateKey.from(value, curve)` to construct. The private constructor
 * guarantees that any instance represents a valid key for its curve.
 */
export class PrivateKey {
  private readonly raw: string; // 64 lowercase hex chars, no 0x prefix
  readonly curve: Curve;

  private constructor(raw: string, curve: Curve) {
    this.raw = raw.toLowerCase();
    this.curve = curve;
  }

  static from(value: string, curve: Curve): PrivateKey {
    switch (curve) {
      case "secp256k1":
        return PrivateKey.fromSecp256k1(value);
    }
  }

  private static fromSecp256k1(value: string): PrivateKey {
    const stripped = value.startsWith("0x") || value.startsWith("0X") ? value.slice(2) : value;

    if (!HEX_64_REGEX.test(stripped)) {
      throw new Error("Invalid secp256k1 private key: expected 32 bytes (64 hex characters)");
    }

    const keyValue = BigInt("0x" + stripped);

    if (keyValue === 0n) {
      throw new Error("Invalid secp256k1 private key: key cannot be zero");
    }

    if (keyValue >= SECP256K1_ORDER) {
      throw new Error("Invalid secp256k1 private key: value exceeds curve order");
    }

    return new PrivateKey(stripped, "secp256k1");
  }

  /**
   * Returns the key as a 0x-prefixed hex string.
   * Suitable for viem's `privateKeyToAccount` and other EVM tooling.
   */
  toHex(): HexString {
    return `0x${this.raw}` as HexString;
  }

  /**
   * Returns the raw 64-character hex string without a 0x prefix.
   * Suitable for chains that expect un-prefixed keys (e.g. TRON).
   */
  toString(): string {
    return this.raw;
  }
}
