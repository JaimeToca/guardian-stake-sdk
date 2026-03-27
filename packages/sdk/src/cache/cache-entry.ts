export interface CacheEntry<V> {
  value: V;
  expiration: number; // milliseconds
}
