import { CacheEntry } from "./cache-entry";

/**
 * Simple implementation of in memory cache (WARNING: Not thread safe)
 */
export class InMemoryCache<K, V> {
  private cache = new Map<K, CacheEntry<V>>();
  private defaultTtlMs: number;

  constructor(defaultTtlMs: number = 180000) {
    this.defaultTtlMs = defaultTtlMs;
  }

  /**
   * Stores a value in the cache with an optional custom TTL.
   *
   * @param key - The key to store the value under.
   * @param value - The value to store.
   * @param ttlMs - Optional TTL for this specific entry.
   */
  public set(key: K, value: V, ttlMs?: number): void {
    const expiration = Date.now() + (ttlMs ?? this.defaultTtlMs);
    this.cache.set(key, { value, expiration });
    console.log(
      `Cache: Set key '${String(key)}', expires at ${new Date(
        expiration
      ).toLocaleTimeString()}`
    );
  }

  /**
   * Retrieves a value from the cache.
   * If the entry has expired, it is removed and `undefined` is returned.
   *
   * @param key - The key to retrieve.
   * @returns The value if found and valid; otherwise, `undefined`.
   */
  public get(key: K): V | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      console.log(`Cache: Get key '${String(key)}' - Not found.`);
      return undefined;
    }

    if (Date.now() >= entry.expiration) {
      this.delete(key);
      console.log(`Cache: Get key '${String(key)}' - Expired and removed.`);
      return undefined;
    }

    console.log(`Cache: Get key '${String(key)}' - Found.`);
    return entry.value;
  }

  /**
   * Deletes an entry from the cache.
   *
   * @param key - The key to delete.
   * @returns `true` if the entry was deleted, `false` if not found.
   */
  public delete(key: K): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      console.log(`Cache: Deleted key '${String(key)}'.`);
    } else {
      console.log(`Cache: Key '${String(key)}' not found for deletion.`);
    }
    return deleted;
  }

  /**
   * Checks whether a valid (non-expired) entry exists for the given key.
   *
   * @param key - The key to check.
   * @returns `true` if the entry exists and is not expired.
   */
  public has(key: K): boolean {
    const entry = this.cache.get(key);
    return !!entry && Date.now() < entry.expiration;
  }

  /**
   * Clears all entries from the cache.
   */
  public clear(): void {
    this.cache.clear();
    console.log("Cache: All items cleared.");
  }

  /**
   * Returns the number of items currently in the cache.
   * Note: Expired items are counted until manually accessed or cleared.
   *
   * @returns The number of cached entries.
   */
  public size(): number {
    return this.cache.size;
  }
}