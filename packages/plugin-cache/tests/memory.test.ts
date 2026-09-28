import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  CacheEntityNames,
  createInMemoryCache,
  isIterableCache,
  MemoryEntityCache,
} from "../src/index.js";

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

  test("GIVEN a read THEN it returns the value rather than a promise", () => {
    const cache = new MemoryEntityCache<{ id: string }>(1);

    cache.set("1", { id: "1" });

    expect(cache.synchronous).toBe(true);
    expect(cache.get("1")).not.toBeInstanceOf(Promise);
    expect(cache.get("2")).toBeUndefined();
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

  test("GIVEN any options THEN every entity cache is synchronous", () => {
    for (const cache of [
      createInMemoryCache(),
      createInMemoryCache({ maxSize: { messages: 5 } }),
    ]) {
      for (const name of CacheEntityNames) expect(cache[name].synchronous).toBe(true);
    }
  });
});

describe("MemoryEntityCache time-to-live", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("GIVEN an entry with a ttl THEN it is gone once expired", () => {
    const cache = new MemoryEntityCache<{ id: string }>();
    cache.set("1", { id: "1" }, { ttl: 100 });
    cache.set("2", { id: "2" });

    vi.advanceTimersByTime(100);
    expect(cache.get("1")).toEqual({ id: "1" });

    vi.advanceTimersByTime(1);
    expect(cache.has("1")).toBe(false);
    expect(cache.getSize()).toBe(1);
    expect(cache.keys()).toEqual(["2"]);
    expect(cache.values()).toEqual([{ id: "2" }]);
    expect(cache.entries()).toEqual([["2", { id: "2" }]]);
    expect(cache.get("1")).toBeUndefined();
  });

  test("GIVEN a default ttl THEN it applies unless a write overrides it", () => {
    const cache = new MemoryEntityCache<{ id: string }>(Infinity, { ttl: 50 });
    cache.set("1", { id: "1" });
    cache.set("2", { id: "2" }, { ttl: null });
    cache.set("3", { id: "3" }, { ttl: 500 });

    vi.advanceTimersByTime(51);

    expect(cache.keys()).toEqual(["2", "3"]);
  });

  test("GIVEN a sweepInterval THEN expired entries are dropped without reads", () => {
    const cache = new MemoryEntityCache<{ id: string }>(Infinity, { sweepInterval: 1_000 });
    cache.set("1", { id: "1" }, { ttl: 10 });
    const sweep = vi.spyOn(cache, "sweep");

    vi.advanceTimersByTime(1_000);

    expect(sweep).toHaveBeenCalledTimes(1);
    expect(sweep.mock.results[0]!.value).toBe(1);

    cache.dispose();
    vi.advanceTimersByTime(5_000);
    expect(sweep).toHaveBeenCalledTimes(1);
  });

  test("GIVEN an invalid ttl THEN it throws", () => {
    expect(() => new MemoryEntityCache(Infinity, { ttl: 0 })).toThrow(RangeError);
    expect(() => new MemoryEntityCache().set("1", {}, { ttl: -1 })).toThrow(RangeError);
  });
});

describe("MemoryEntityCache#upsert", () => {
  test("GIVEN no entry THEN the data is stored as is", () => {
    const cache = new MemoryEntityCache<{ id: string; name?: string }>();

    expect(cache.upsert("1", { id: "1" })).toEqual({ existing: undefined, added: { id: "1" } });
    expect(cache.get("1")).toEqual({ id: "1" });
  });

  test("GIVEN an entry THEN the data is shallowly merged into it", () => {
    const cache = new MemoryEntityCache<{ id: string; name?: string; bot?: boolean }>();
    cache.set("1", { id: "1", name: "old", bot: false });

    expect(cache.upsert("1", { name: "new" })).toEqual({
      existing: { id: "1", name: "old", bot: false },
      added: { id: "1", name: "new", bot: false },
    });
  });

  test("GIVEN overwrite THEN the entry is replaced", () => {
    const cache = new MemoryEntityCache<{ id: string; name?: string }>();
    cache.set("1", { id: "1", name: "old" });

    cache.upsert("1", { id: "1" }, { overwrite: true });

    expect(cache.get("1")).toEqual({ id: "1" });
  });

  test("GIVEN a maxSize of 0 THEN the merged entry is returned but not stored", () => {
    const cache = new MemoryEntityCache<{ id: string }>(0);

    expect(cache.upsert("1", { id: "1" }).added).toEqual({ id: "1" });
    expect(cache.has("1")).toBe(false);
  });
});

describe("createInMemoryCache options", () => {
  test("GIVEN entities THEN only those are cached", () => {
    const cache = createInMemoryCache({ entities: ["users", "guilds"] });

    expect(Object.keys(cache).toSorted()).toEqual(["guilds", "users"]);
    expect(cache.members).toBeUndefined();
  });

  test("GIVEN a per-entity ttl THEN only those stores expire their entries", () => {
    vi.useFakeTimers();
    try {
      const cache = createInMemoryCache({ ttl: { users: 10 } });
      cache.users!.set("1", {
        id: "1",
        username: "a",
        discriminator: "0",
        global_name: null,
        avatar: null,
      });
      cache.guilds!.set("2", { id: "2" } as never);

      vi.advanceTimersByTime(11);

      expect(cache.users!.has("1")).toBe(false);
      expect(cache.guilds!.has("2")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  test("GIVEN policies THEN the stores follow them and stay synchronous and iterable", () => {
    const cache = createInMemoryCache({ policies: { users: { filter: (user) => !user.bot } } });

    cache.users!.set("1", {
      id: "1",
      username: "a",
      discriminator: "0",
      global_name: null,
      avatar: null,
      bot: true,
    });

    expect(cache.users!.has("1")).toBe(false);
    expect(cache.users!.synchronous).toBe(true);
    expect(isIterableCache(cache.users!)).toBe(true);
  });
});
