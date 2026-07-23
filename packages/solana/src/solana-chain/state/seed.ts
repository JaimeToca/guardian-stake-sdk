import { address, createAddressWithSeed } from "@solana/kit";
import {
  DEFAULT_SEED_SCAN_GAP_LIMIT,
  DEFAULT_SEED_SCAN_MAX,
  MAX_SEED_LENGTH,
  STAKE_PROGRAM_ADDRESS,
} from "./constants";

/**
 * Solana `create_with_seed` address derivation via Kit {@link createAddressWithSeed}
 * (NOT a PDA): `SHA256(base ‖ seed ‖ owner)` → first 32 bytes as pubkey.
 *
 * Seed must be at most {@link MAX_SEED_LENGTH} bytes (UTF-8).
 */
export async function deriveStakeAddressWithSeed(
  base: string,
  seed: string,
  owner: string
): Promise<string> {
  return createAddressWithSeed({
    baseAddress: address(base),
    programAddress: address(owner),
    seed,
  });
}

/**
 * Derive a stake account address for the Stake program using a decimal seed string
 * (`"0"`, `"1"`, … — CLI-compatible).
 */
export async function deriveStakeAddress(base: string, seed: string): Promise<string> {
  return createAddressWithSeed({
    baseAddress: address(base),
    programAddress: STAKE_PROGRAM_ADDRESS,
    seed,
  });
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
