import { describe, expect, test } from "vitest";
import { CacheEntityNames, createInMemoryCache, MemoryEntityCache } from "../src/index.js";

describe("MemoryEntityCache", () => {
  test("GIVEN entries THEN it behaves like a Map", () => {
    const cache = new MemoryEntityCache<{ id: string }>();

    cache.set("1", { id: "1" });
    cache.set("2", { id: "2" });

    expect(cache.get("1")).toEqual({ id: "1" });
    expect(cache.has("2")).toBe(true);
    expect(cache.getSize()).toBe(2);
    expect(cache.keys()).toEqual(["1", "2"]);
    expect(cache.values()).toEqual([{ id: "1" }, { id: "2" }]);
    expect(cache.entries()).toEqual([
      ["1", { id: "1" }],
      ["2", { id: "2" }],
    ]);

    expect(cache.delete("1")).toBe(true);
    expect(cache.delete("1")).toBe(false);
    expect(cache.get("1")).toBeUndefined();

    cache.clear();
    expect(cache.getSize()).toBe(0);
  });

  test("GIVEN a maxSize THEN the least recently used entry is evicted", () => {
    const cache = new MemoryEntityCache<number>(2);

    cache.set("a", 1);
    cache.set("b", 2);
    // Reading "a" makes "b" the least recently used entry.
    cache.get("a");
    cache.set("c", 3);

    expect(cache.keys()).toEqual(["a", "c"]);
  });

  test("GIVEN a maxSize of 0 THEN nothing is stored", () => {
    const cache = new MemoryEntityCache<number>(0);

    cache.set("a", 1);

    expect(cache.getSize()).toBe(0);
  });

  test("GIVEN an invalid maxSize THEN it throws", () => {
    expect(() => new MemoryEntityCache(-1)).toThrow(RangeError);
    expect(() => new MemoryEntityCache(1.5)).toThrow(RangeError);
  });
});

describe("createInMemoryCache", () => {
  test("GIVEN no options THEN every entity cache is unbounded", () => {
    const cache = createInMemoryCache();

    for (const name of CacheEntityNames) {
      expect(cache[name]).toBeInstanceOf(MemoryEntityCache);
      expect(cache[name].maxSize).toBe(Infinity);
    }
  });

  test("GIVEN a numeric maxSize THEN it applies to every entity cache", () => {
    const cache = createInMemoryCache({ maxSize: 10 });

    expect(cache.users.maxSize).toBe(10);
    expect(cache.messages.maxSize).toBe(10);
  });

  test("GIVEN a per-entity maxSize THEN only those entity caches are bounded", () => {
    const cache = createInMemoryCache({ maxSize: { messages: 5 } });

    expect(cache.messages.maxSize).toBe(5);
    expect(cache.users.maxSize).toBe(Infinity);
  });
});
