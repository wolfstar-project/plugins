import { describe, expect, test, vi } from "vitest";
import {
  createCache,
  isIterableCache,
  withPolicy,
  type CacheSetOptions,
  type CacheUpsertOptions,
  type EntityCache,
} from "../src/index.js";

interface Value {
  id: string;
  name?: string;
  bot?: boolean;
}

// A minimal synchronous store implementing only the base contract, recording the options it receives.
class BaseStore implements EntityCache<Value> {
  public readonly synchronous = true;
  public readonly items = new Map<string, Value>();
  public readonly options: (CacheSetOptions | undefined)[] = [];

  public get(key: string) {
    return this.items.get(key);
  }

  public set(key: string, value: Value, options?: CacheSetOptions) {
    this.options.push(options);
    this.items.set(key, value);
  }

  public upsert(key: string, data: Partial<Value>, options?: CacheUpsertOptions) {
    this.options.push(options);
    const existing = this.items.get(key);
    const added = (options?.overwrite || !existing ? data : { ...existing, ...data }) as Value;
    this.items.set(key, added);
    return { existing, added };
  }

  public has(key: string) {
    return this.items.has(key);
  }

  public delete(key: string) {
    return this.items.delete(key);
  }

  public clear() {
    this.items.clear();
  }

  public getSize() {
    return this.items.size;
  }
}

class IterableStore extends BaseStore {
  public keys() {
    return [...this.items.keys()];
  }

  public values() {
    return [...this.items.values()];
  }

  public entries() {
    return [...this.items.entries()];
  }
}

describe("withPolicy", () => {
  test("GIVEN a filter rejecting a value THEN set skips it and deletes the cached entry", () => {
    const inner = new BaseStore();
    inner.items.set("1", { id: "1", bot: false });
    const cache = withPolicy(inner, { filter: (value) => !value.bot });

    cache.set("1", { id: "1", bot: true });
    cache.set("2", { id: "2", bot: true });

    expect(inner.items.has("1")).toBe(false);
    expect(inner.items.has("2")).toBe(false);
  });

  test("GIVEN a filter THEN upsert evaluates the merged value and still returns it", () => {
    const inner = new BaseStore();
    inner.items.set("1", { id: "1", bot: true, name: "old" });
    const cache = withPolicy(inner, { filter: (value) => !value.bot });

    const result = cache.upsert("1", { name: "new" });

    expect(result).toEqual({
      existing: { id: "1", bot: true, name: "old" },
      added: { id: "1", bot: true, name: "new" },
    });
    expect(inner.items.has("1")).toBe(false);
  });

  test("GIVEN a filter accepting a value THEN upsert writes it", () => {
    const inner = new BaseStore();
    const cache = withPolicy(inner, { filter: (value) => !value.bot });

    cache.upsert("1", { id: "1", bot: false });

    expect(inner.items.get("1")).toEqual({ id: "1", bot: false });
  });

  test("GIVEN a ttl THEN it is passed to the wrapped store", () => {
    const inner = new BaseStore();
    const cache = withPolicy(inner, { ttl: (value) => (value.bot ? 1_000 : null) });

    cache.set("1", { id: "1", bot: true });
    cache.upsert("2", { id: "2", bot: false }, { overwrite: true });

    expect(inner.options).toEqual([{ ttl: 1_000 }, { overwrite: true, ttl: null }]);
  });

  test("GIVEN a synchronous store THEN the wrapper stays synchronous", () => {
    const cache = withPolicy(new BaseStore(), { filter: () => true });

    expect(cache.synchronous).toBe(true);
    expect(cache.upsert("1", { id: "1" })).not.toBeInstanceOf(Promise);
  });

  test("GIVEN an asynchronous store THEN the wrapper awaits its reads", async () => {
    const inner = new BaseStore();
    inner.items.set("1", { id: "1", bot: false });
    const store: EntityCache<Value> = {
      synchronous: false,
      get: async (key) => inner.get(key),
      set: async (key, value, options) => inner.set(key, value, options),
      upsert: async (key, data, options) => inner.upsert(key, data, options),
      has: async (key) => inner.has(key),
      delete: async (key) => inner.delete(key),
      clear: async () => inner.clear(),
      getSize: async () => inner.getSize(),
    };
    const cache = withPolicy(store, { filter: (value) => !value.bot });

    await cache.upsert("1", { bot: true });

    expect(cache.synchronous).toBe(false);
    expect(inner.items.has("1")).toBe(false);
  });

  test("GIVEN the wrapped store's iteration support THEN the wrapper mirrors it", () => {
    expect(isIterableCache(withPolicy(new BaseStore(), {}))).toBe(false);

    const inner = new IterableStore();
    inner.items.set("1", { id: "1" });
    const cache = withPolicy(inner, {});

    expect(isIterableCache(cache)).toBe(true);
    if (isIterableCache(cache)) expect(cache.keys()).toEqual(["1"]);
  });

  test("GIVEN a store with deleteGuild THEN the wrapper forwards it", () => {
    const inner = Object.assign(new BaseStore(), { deleteGuild: vi.fn(() => 3) });

    expect(withPolicy(inner, {}).deleteGuild?.("10")).toBe(3);
    expect(withPolicy(new BaseStore(), {}).deleteGuild).toBeUndefined();
  });
});

describe("createCache", () => {
  test("GIVEN a factory THEN it holds only the stores the factory returns", () => {
    const users = new BaseStore();
    const makeCache = vi.fn((entity: string) => (entity === "users" ? users : null));

    const cache = createCache({ makeCache });

    expect(cache.users).toBe(users);
    expect(cache.members).toBeUndefined();
    expect("members" in cache).toBe(false);
    expect(Object.isFrozen(cache)).toBe(true);
    expect(makeCache).toHaveBeenCalledWith("members");
  });

  test("GIVEN policies THEN the stores are wrapped", () => {
    const users = new BaseStore();
    const cache = createCache({
      makeCache: (entity) => (entity === "users" ? users : undefined),
      policies: { users: { filter: (user) => !user.bot } },
    });

    cache.users!.set("1", {
      id: "1",
      username: "bot",
      discriminator: "0",
      global_name: null,
      avatar: null,
      bot: true,
    });

    expect(cache.users).not.toBe(users);
    expect(users.items.size).toBe(0);
  });
});
