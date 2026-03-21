"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryCache = void 0;
class InMemoryCache {
    cache = new Map();
    defaultTtlMs;
    constructor(defaultTtlMs = 180000) {
        this.defaultTtlMs = defaultTtlMs;
    }
    set(key, value, ttlMs) {
        const expiration = Date.now() + (ttlMs ?? this.defaultTtlMs);
        this.cache.set(key, { value, expiration });
    }
    get(key) {
        const entry = this.cache.get(key);
        if (!entry)
            return undefined;
        if (Date.now() >= entry.expiration) {
            this.delete(key);
            return undefined;
        }
        return entry.value;
    }
    delete(key) {
        return this.cache.delete(key);
    }
    has(key) {
        const entry = this.cache.get(key);
        return !!entry && Date.now() < entry.expiration;
    }
    clear() {
        this.cache.clear();
    }
    size() {
        return this.cache.size;
    }
}
exports.InMemoryCache = InMemoryCache;
//# sourceMappingURL=in-memory-cache.js.map