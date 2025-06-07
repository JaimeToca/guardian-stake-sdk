"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryCache = void 0;
class InMemoryCache {
    constructor(defaultTtlMs = 180000) {
        this.cache = new Map();
        this.defaultTtlMs = defaultTtlMs;
    }
    set(key, value, ttlMs) {
        const expiration = Date.now() + (ttlMs ?? this.defaultTtlMs);
        this.cache.set(key, { value, expiration });
        console.log(`Cache: Set key '${String(key)}', expires at ${new Date(expiration).toLocaleTimeString()}`);
    }
    get(key) {
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
    delete(key) {
        const deleted = this.cache.delete(key);
        if (deleted) {
            console.log(`Cache: Deleted key '${String(key)}'.`);
        }
        else {
            console.log(`Cache: Key '${String(key)}' not found for deletion.`);
        }
        return deleted;
    }
    has(key) {
        const entry = this.cache.get(key);
        return !!entry && Date.now() < entry.expiration;
    }
    clear() {
        this.cache.clear();
        console.log("Cache: All items cleared.");
    }
    size() {
        return this.cache.size;
    }
}
exports.InMemoryCache = InMemoryCache;
//# sourceMappingURL=in-memory-cache.js.map