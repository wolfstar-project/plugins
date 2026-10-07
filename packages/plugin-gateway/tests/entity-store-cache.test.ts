import { MemoryEntityCache, type Awaitable, type EntityCache } from "@wolfstar/plugin-cache";
import type { APIUser } from "discord-api-types/v10";
import { describe, expect, test, vi } from "vitest";
import { EntityStoreCache, NullCache, User } from "../src/index.js";

const user: APIUser = {
  id: "600000000000000600",
  username: "wolf",
  discriminator: "0",
  global_name: "Wolf",
  avatar: null,
};

// Wraps a synchronous store so that every method returns a promise, like Redis.
function asynchronous(store: EntityCache<APIUser>): EntityCache<APIUser> {
  return {
    get: async (key) => store.get(key),
    set: async (key, value, options) => store.set(key, value, options),
    upsert: async (key, data, options) => store.upsert(key, data, options),
    has: async (key) => store.has(key),
    delete: async (key) => store.delete(key),
    clear: async () => store.clear(),
    getSize: async () => store.getSize(),
  };
}

function createCache(store: EntityCache<APIUser>, mode: "miss" | "throw" = "miss") {
  const errors: unknown[] = [];
  const cache = new EntityStoreCache<User, APIUser>((data) => new User(data as APIUser), "users", {
    store,
    keyOf: (data) => data.id!,
    guard<T>(_operation: string, _key: string | null, run: () => Awaitable<T>, fallback: T) {
      const fail = (error: unknown): T => {
        errors.push(error);
        if (mode === "throw") throw error;
        return fallback;
      };
      try {
        const result = run();
        return result instanceof Promise ? result.catch(fail) : result;
      } catch (error) {
        return fail(error);
      }
    },
  });
  return { cache, errors };
}

describe("EntityStoreCache", () => {
  test("GIVEN a synchronous store THEN every method answers without a promise", () => {
    const { cache } = createCache(new MemoryEntityCache<APIUser>());

    expect(cache.synchronous).toBe(true);
    expect(cache.get(user.id)).toBeUndefined();
    expect(cache.add(user)).toBeInstanceOf(User);
    expect((cache.get(user.id) as User).username).toBe("wolf");
    expect(cache.has(user.id)).toBe(true);
    expect(cache.getSize()).toBe(1);
    expect(cache.delete(user.id)).toBe(true);
    expect(cache.getSize()).toBe(0);
  });

  test("GIVEN an asynchronous store THEN the methods resolve to the same values", async () => {
    const { cache } = createCache(asynchronous(new MemoryEntityCache<APIUser>()));

    expect(cache.synchronous).toBe(false);
    expect(cache.get(user.id)).toBeInstanceOf(Promise);
    expect(await cache.add(user)).toBeInstanceOf(User);
    expect((await cache.get(user.id))?.username).toBe("wolf");
    await cache.clear();
    expect(await cache.getSize()).toBe(0);
  });

  test("GIVEN add THEN the data is merged unless overwrite is set", () => {
    const store = new MemoryEntityCache<APIUser>();
    const { cache } = createCache(store);
    store.set(user.id, { ...user, banner: "banner" });

    expect((cache.add({ id: user.id, username: "howl" }) as User).banner).toBe("banner");
    cache.add({ ...user, username: "pup" }, true);
    expect((store.get(user.id) as APIUser).banner).toBeUndefined();
  });

  test("GIVEN set THEN the structure is stored as raw data and the cache returned", () => {
    const store = new MemoryEntityCache<APIUser>();
    const { cache } = createCache(store);

    expect(cache.set(user.id, new User(user))).toBe(cache);
    expect(store.get(user.id)).toEqual(user);
  });

  test("GIVEN two reads THEN each builds its own structure", () => {
    const store = new MemoryEntityCache<APIUser>();
    const { cache } = createCache(store);
    store.set(user.id, user);

    expect(cache.get(user.id)).not.toBe(cache.get(user.id));
  });

  test("GIVEN a throwing store under miss THEN it behaves like an empty cache", () => {
    const store = new MemoryEntityCache<APIUser>();
    for (const method of ["get", "set", "upsert", "has", "delete", "clear", "getSize"] as const) {
      vi.spyOn(store, method).mockImplementation(() => {
        throw new Error("down");
      });
    }
    const { cache, errors } = createCache(store);

    expect(cache.get(user.id)).toBeUndefined();
    expect(cache.has(user.id)).toBe(false);
    expect(cache.delete(user.id)).toBe(false);
    expect(cache.getSize()).toBe(0);
    expect((cache.add(user) as User).id).toBe(user.id);
    expect(cache.set(user.id, new User(user))).toBe(cache);
    expect(errors).toHaveLength(6);
  });

  test("GIVEN a throwing synchronous store under throw THEN the error is thrown synchronously", () => {
    const store = new MemoryEntityCache<APIUser>();
    vi.spyOn(store, "get").mockImplementation(() => {
      throw new Error("down");
    });
    const { cache } = createCache(store, "throw");

    expect(() => cache.get(user.id)).toThrow("down");
  });
});

describe("NullCache", () => {
  test("GIVEN any call THEN it is empty and add still builds the structure", () => {
    const cache = new NullCache<User, APIUser>((data) => new User(data as APIUser), "users");

    expect(cache.synchronous).toBe(true);
    expect(cache.get(user.id)).toBeUndefined();
    expect(cache.has(user.id)).toBe(false);
    expect(cache.delete(user.id)).toBe(false);
    expect(cache.getSize()).toBe(0);
    expect(cache.clear()).toBeUndefined();
    expect(cache.set(user.id, new User(user))).toBe(cache);
    expect(cache.add(user).id).toBe(user.id);
    expect(cache.get(user.id)).toBeUndefined();
  });
});
