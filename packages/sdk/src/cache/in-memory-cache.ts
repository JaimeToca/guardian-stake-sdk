import type { CacheEntry } from "./cache-entry";
import type { CacheContract } from "./cache-contract";

/**
 * Simple in-process, TTL-based cache backed by a `Map`.
 *
 * This was chosen intentionally to keep the SDK dependency-free. The only cached
 * data is the validator list, which is small, read-only, and rarely changes in
 * practice — validators are added or removed at the protocol level on a timescale
 * of days to weeks, not seconds. This makes a lightweight in-process cache the
 * right trade-off over adding an external dependency like `lru-cache` or `node-cache`.
 *
 * **Pitfalls to be aware of:**
 *
 * - **Not safe across multiple processes or instances.** Each process holds its own
 *   cache. If the SDK is used in a horizontally scaled backend (e.g., multiple Node
 *   instances behind a load balancer), every instance maintains its own copy and
 *   will issue its own RPC calls independently. Use a shared cache (e.g., Redis) if
 *   cross-instance consistency matters.
 *
 * - **Cache stampede on expiry.** There is no locking mechanism. If many requests
 *   arrive simultaneously the moment a TTL expires, they will all see a cache miss
 *   and fire concurrent RPC calls. For the validator use case this is harmless since
 *   the result is idempotent, but it is worth knowing under high load.
 *
 * - **`size()` includes expired entries.** Eviction is lazy — entries are only
 *   removed when accessed via `get`. `size()` reflects the raw `Map` size, which
 *   may include stale entries that haven't been touched yet.
 *
 * - **No max-size cap.** Memory is unbounded. This is acceptable here because the
 *   key space is fixed (one entry per chain), but would be a problem if used with
 *   a large or dynamic key space.
 */
export class InMemoryCache<K, V> implements CacheContract<K, V> {
  private cache = new Map<K, CacheEntry<V>>();
  private defaultTtlMs: number;

  constructor(defaultTtlMs: number = 180000) {
    this.defaultTtlMs = defaultTtlMs;
  }

  public set(key: K, value: V, ttlMs?: number): void {
    const expiration = Date.now() + (ttlMs ?? this.defaultTtlMs);
    this.cache.set(key, { value, expirationInMillis: expiration });
  }

  public get(key: K): V | undefined {
    const entry = this.cache.get(key);

    if (!entry) return undefined;

    if (Date.now() >= entry.expirationInMillis) {
      this.delete(key);
      return undefined;
    }

    return entry.value;
  }

  public delete(key: K): boolean {
    return this.cache.delete(key);
  }

  public has(key: K): boolean {
    const entry = this.cache.get(key);
    return !!entry && Date.now() < entry.expirationInMillis;
  }

  public clear(): void {
    this.cache.clear();
  }

  public size(): number {
    return this.cache.size;
  }
}
