import { createHash } from "node:crypto";
import { address, getAddressDecoder, getAddressEncoder } from "@solana/kit";
import {
  DEFAULT_SEED_SCAN_GAP_LIMIT,
  DEFAULT_SEED_SCAN_MAX,
  MAX_SEED_LENGTH,
  STAKE_PROGRAM_ADDRESS,
} from "./constants";

const addressEncoder = getAddressEncoder();
const addressDecoder = getAddressDecoder();

/**
 * Solana `create_with_seed` address derivation (NOT a PDA):
 * `SHA256(base_pubkey_bytes || seed_utf8_bytes || owner_pubkey_bytes)` → first 32 bytes as pubkey.
 *
 * Seed must be at most {@link MAX_SEED_LENGTH} bytes (UTF-8).
 */
export function deriveStakeAddressWithSeed(base: string, seed: string, owner: string): string {
  if (new TextEncoder().encode(seed).length > MAX_SEED_LENGTH) {
    throw new Error(`seed must be at most ${MAX_SEED_LENGTH} bytes`);
  }

  const baseBytes = addressEncoder.encode(address(base));
  const ownerBytes = addressEncoder.encode(address(owner));
  const seedBytes = Buffer.from(seed, "utf8");

  const digest = createHash("sha256")
    .update(Buffer.from(baseBytes))
    .update(seedBytes)
    .update(Buffer.from(ownerBytes))
    .digest();

  return addressDecoder.decode(digest.subarray(0, 32));
}

/**
 * Derive a stake account address for the Stake program using a decimal seed string
 * (`"0"`, `"1"`, … — CLI-compatible).
 */
export function deriveStakeAddress(base: string, seed: string): string {
  return deriveStakeAddressWithSeed(base, seed, STAKE_PROGRAM_ADDRESS);
}

/** CLI-compatible seed string for a numeric index. */
export function seedString(index: number): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error("seed index must be a non-negative integer");
  }
  return String(index);
}

/**
 * Indices to probe during a seed scan: `0 … max` inclusive.
 * Runtime discovery stops early after `gapLimit` consecutive missing accounts (see discovery service).
 */
export function scanSeedIndices(
  max: number = DEFAULT_SEED_SCAN_MAX,
  _gapLimit: number = DEFAULT_SEED_SCAN_GAP_LIMIT
): number[] {
  if (!Number.isInteger(max) || max < 0) {
    throw new Error("seed scan max must be a non-negative integer");
  }
  const indices: number[] = [];
  for (let i = 0; i <= max; i++) {
    indices.push(i);
  }
  return indices;
}

export { DEFAULT_SEED_SCAN_GAP_LIMIT, DEFAULT_SEED_SCAN_MAX, MAX_SEED_LENGTH };
