import { createInMemoryCache, type CacheContract } from "@guardian-sdk/sdk";
import { DEFAULT_STAKE_CACHE_TTL_MS } from "./constants";
import type { StakePosition } from "./stake-account";

export interface StakePositionCache {
  get(authority: string): StakePosition[] | undefined;
  set(authority: string, positions: StakePosition[], ttlMs?: number): void;
  delete(authority: string): boolean;
  has(authority: string): boolean;
  clear(): void;
  /** Underlying cache (for tests / advanced use). */
  readonly cache: CacheContract<string, StakePosition[]>;
}

/**
 * Shared authority → stake positions cache used by `getDelegations` / `getBalances`.
 * Default TTL: 30s ({@link DEFAULT_STAKE_CACHE_TTL_MS}).
 */
export function createStakePositionCache(
  ttlMs: number = DEFAULT_STAKE_CACHE_TTL_MS
): StakePositionCache {
  const cache = createInMemoryCache<string, StakePosition[]>(ttlMs);

  return {
    cache,
    get(authority) {
      return cache.get(authority);
    },
    set(authority, positions, entryTtlMs) {
      cache.set(authority, positions, entryTtlMs);
    },
    delete(authority) {
      return cache.delete(authority);
    },
    has(authority) {
      return cache.has(authority);
    },
    clear() {
      cache.clear();
    },
  };
}
