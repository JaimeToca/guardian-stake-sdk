import { address, type Address } from "@solana/kit";
import { STAKE_PROGRAM_ADDRESS as STAKE_PROGRAM_ADDRESS_KIT } from "@solana-program/stake";
import { SYSTEM_PROGRAM_ADDRESS as SYSTEM_PROGRAM_ADDRESS_KIT } from "@solana-program/system";

/** 1 SOL = 1_000_000_000 lamports. */
export const LAMPORTS_PER_SOL = 1_000_000_000n;

/** Fixed stake account data size (StakeStateV2). */
export const STAKE_ACCOUNT_SPACE = 200;

/** Stake program id. */
export const STAKE_PROGRAM_ADDRESS: Address<"Stake11111111111111111111111111111111111111"> =
  STAKE_PROGRAM_ADDRESS_KIT;

/** System program id. */
export const SYSTEM_PROGRAM_ADDRESS: Address<"11111111111111111111111111111111"> =
  SYSTEM_PROGRAM_ADDRESS_KIT;

/** Sysvar: StakeHistory. */
export const SYSVAR_STAKE_HISTORY_ADDRESS = address("SysvarStakeHistory1111111111111111111111111");

/** Sysvar: Clock. */
export const SYSVAR_CLOCK_ADDRESS = address("SysvarC1ock11111111111111111111111111111111");

/** Sysvar: Rent. */
export const SYSVAR_RENT_ADDRESS = address("SysvarRent111111111111111111111111111111111");

/** Bootstrap / not-deactivating sentinel (`u64::MAX`). */
export const U64_MAX = 18_446_744_073_709_551_615n;

/**
 * Mainnet-era warmup/cooldown rate after `reduce_stake_warmup_cooldown`.
 * Pass as a parameter to activation math; do not read the deprecated account field.
 */
export const DEFAULT_WARMUP_COOLDOWN_RATE = 0.09;

/** Legacy rate before the feature gate (for historical epochs if needed). */
export const LEGACY_WARMUP_COOLDOWN_RATE = 0.25;

/** CreateAccountWithSeed seed string max length (bytes). */
export const MAX_SEED_LENGTH = 32;

/** Default consecutive empty slots before seed-scan stops. */
export const DEFAULT_SEED_SCAN_GAP_LIMIT = 5;

/** Default inclusive max seed index to probe. */
export const DEFAULT_SEED_SCAN_MAX = 50;

/** Default TTL for authority → stake positions cache (ms). */
export const DEFAULT_STAKE_CACHE_TTL_MS = 30_000;
