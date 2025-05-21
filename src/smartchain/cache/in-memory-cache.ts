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

  public set(key: K, value: V, ttlMs?: number): void {
    const expiration = Date.now() + (ttlMs ?? this.defaultTtlMs);
    this.cache.set(key, { value, expiration });
    console.log(
      `Cache: Set key '${String(key)}', expires at ${new Date(
        expiration
      ).toLocaleTimeString()}`
    );
  }

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

  public delete(key: K): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      console.log(`Cache: Deleted key '${String(key)}'.`);
    } else {
      console.log(`Cache: Key '${String(key)}' not found for deletion.`);
    }
    return deleted;
  }

  public has(key: K): boolean {
    const entry = this.cache.get(key);
    return !!entry && Date.now() < entry.expiration;
  }

  public clear(): void {
    this.cache.clear();
    console.log("Cache: All items cleared.");
  }

  public size(): number {
    return this.cache.size;
  }
}
