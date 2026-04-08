export interface CacheEntry<V> {
  value: V;
  expirationInMillis: number;
}
