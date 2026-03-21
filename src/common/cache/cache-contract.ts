export interface CacheContract<K, V> {
  get(key: K): V | undefined;
  set(key: K, value: V, ttlMs?: number): void;
  delete(key: K): boolean;
  has(key: K): boolean;
  clear(): void;
}
