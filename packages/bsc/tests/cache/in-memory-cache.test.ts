import { describe, it, expect, vi, beforeEach } from "vitest";
import { InMemoryCache } from "@guardian-sdk/sdk";

describe("InMemoryCache", () => {
  let cache: InMemoryCache<string, string>;

  beforeEach(() => {
    cache = new InMemoryCache<string, string>(1000);
  });

  describe("set / get", () => {
    it("stores and retrieves a value", () => {
      cache.set("key", "value");
      expect(cache.get("key")).toBe("value");
    });

    it("returns undefined for a missing key", () => {
      expect(cache.get("missing")).toBeUndefined();
    });

    it("overwrites an existing key", () => {
      cache.set("key", "first");
      cache.set("key", "second");
      expect(cache.get("key")).toBe("second");
    });
  });

  describe("TTL expiry", () => {
    it("returns undefined after the default TTL expires", () => {
      const now = Date.now();
      vi.spyOn(Date, "now").mockReturnValue(now);

      cache.set("key", "value");

      vi.spyOn(Date, "now").mockReturnValue(now + 1001);
      expect(cache.get("key")).toBeUndefined();
    });

    it("returns a value before the TTL expires", () => {
      const now = Date.now();
      vi.spyOn(Date, "now").mockReturnValue(now);

      cache.set("key", "value");

      vi.spyOn(Date, "now").mockReturnValue(now + 999);
      expect(cache.get("key")).toBe("value");
    });

    it("respects a per-entry TTL override", () => {
      const now = Date.now();
      vi.spyOn(Date, "now").mockReturnValue(now);

      cache.set("short", "value", 500);

      vi.spyOn(Date, "now").mockReturnValue(now + 501);
      expect(cache.get("short")).toBeUndefined();
    });

    it("removes the entry from the map on expiry", () => {
      const now = Date.now();
      vi.spyOn(Date, "now").mockReturnValue(now);

      cache.set("key", "value");
      vi.spyOn(Date, "now").mockReturnValue(now + 1001);
      cache.get("key");

      expect(cache.size()).toBe(0);
    });
  });

  describe("has", () => {
    it("returns true for a valid entry", () => {
      cache.set("key", "value");
      expect(cache.has("key")).toBe(true);
    });

    it("returns false for a missing key", () => {
      expect(cache.has("missing")).toBe(false);
    });

    it("returns false for an expired entry", () => {
      const now = Date.now();
      vi.spyOn(Date, "now").mockReturnValue(now);

      cache.set("key", "value");

      vi.spyOn(Date, "now").mockReturnValue(now + 1001);
      expect(cache.has("key")).toBe(false);
    });
  });

  describe("delete", () => {
    it("removes an existing entry and returns true", () => {
      cache.set("key", "value");
      expect(cache.delete("key")).toBe(true);
      expect(cache.get("key")).toBeUndefined();
    });

    it("returns false when deleting a non-existent key", () => {
      expect(cache.delete("missing")).toBe(false);
    });
  });

  describe("clear", () => {
    it("removes all entries", () => {
      cache.set("a", "1");
      cache.set("b", "2");
      cache.clear();
      expect(cache.size()).toBe(0);
    });
  });

  describe("size", () => {
    it("reflects the number of stored entries", () => {
      cache.set("a", "1");
      cache.set("b", "2");
      expect(cache.size()).toBe(2);
    });

    it("includes expired entries until they are accessed", () => {
      const now = Date.now();
      vi.spyOn(Date, "now").mockReturnValue(now);

      cache.set("key", "value");

      vi.spyOn(Date, "now").mockReturnValue(now + 1001);
      expect(cache.size()).toBe(1);
    });
  });
});
