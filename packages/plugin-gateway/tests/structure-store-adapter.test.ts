import { isIterableCache } from "@wolfstar/plugin-cache";
import type { APIUser } from "discord-api-types/v10";
import { describe, expect, test, vi } from "vitest";
import { CollectionCache, NullCache, User } from "../src/index.js";
import { createStructureStoreAdapter } from "../src/util/StructureStoreAdapter.js";

const user: APIUser = {
  id: "600000000000000600",
  username: "wolf",
  discriminator: "0",
  global_name: "Wolf",
  avatar: null,
};

function create() {
  const cache = new CollectionCache<User>((data) => new User(data as APIUser), "users");
  return { cache, store: createStructureStoreAdapter<User, APIUser>(cache) };
}

describe("StructureStoreAdapter", () => {
  test("GIVEN a CollectionCache THEN the adapter is synchronous and iterable", () => {
    const { store } = create();

    expect(store.synchronous).toBe(true);
    expect(isIterableCache(store)).toBe(true);
  });

  test("GIVEN set THEN a structure is built, and get returns raw data", () => {
    const { cache, store } = create();

    store.set(user.id, user);

    expect(cache.get(user.id)).toBeInstanceOf(User);
    expect(store.get(user.id)).toEqual(user);
    expect(store.get("missing")).toBeUndefined();
    expect(store.has(user.id)).toBe(true);
    expect(store.getSize()).toBe(1);
  });

  test("GIVEN set on a cached entry THEN the instance is patched in place", () => {
    const { cache, store } = create();
    store.set(user.id, user);
    const instance = cache.get(user.id);

    store.set(user.id, { ...user, username: "howl" });

    expect(cache.get(user.id)).toBe(instance);
    expect(instance?.username).toBe("howl");
  });

  test("GIVEN upsert on a cached entry THEN the instance is patched and both states returned", () => {
    const { cache, store } = create();
    store.set(user.id, user);
    const instance = cache.get(user.id);

    const result = store.upsert(user.id, { username: "howl" }) as {
      existing?: APIUser;
      added: APIUser;
    };

    expect(cache.get(user.id)).toBe(instance);
    expect(instance?.username).toBe("howl");
    expect(result.existing?.username).toBe("wolf");
    expect(result.added).toMatchObject({ username: "howl", global_name: "Wolf" });
  });

  test("GIVEN upsert with overwrite THEN the entry is replaced", () => {
    const { cache, store } = create();
    store.set(user.id, { ...user, banner: "banner" });

    store.upsert(user.id, user, { overwrite: true });

    expect(cache.get(user.id)?.banner).toBeFalsy();
  });

  test("GIVEN upsert on a missing entry THEN it is created under the given key", () => {
    const { cache, store } = create();

    const result = store.upsert("custom", user) as { existing?: APIUser; added: APIUser };

    expect(result.existing).toBeUndefined();
    expect(cache.get("custom")?.id).toBe(user.id);
  });

  test("GIVEN entries THEN keys, values, and entries are raw snapshots", () => {
    const { store } = create();
    store.set(user.id, user);
    if (!isIterableCache(store)) throw new Error("not iterable");

    expect(store.keys()).toEqual([user.id]);
    expect(store.values()).toEqual([user]);
    expect(store.entries()).toEqual([[user.id, user]]);
  });

  test("GIVEN delete and clear THEN the structure cache follows", () => {
    const { cache, store } = create();
    store.set(user.id, user);

    expect(store.delete(user.id)).toBe(true);
    store.set(user.id, user);
    store.clear();
    expect(cache.size).toBe(0);
  });

  test("GIVEN a CollectionCache with a refresh hook THEN the adapter's reads and writes do not trigger it", () => {
    const refresh = vi.fn((value: User) => value);
    const cache = new CollectionCache<User>((data) => new User(data as APIUser), "users", {
      refresh,
    });
    const store = createStructureStoreAdapter<User, APIUser>(cache);
    store.set(user.id, user);

    expect(store.get(user.id)).toEqual(user);
    store.upsert(user.id, { username: "howl" });
    store.set(user.id, { ...user, username: "wolf" });

    expect(refresh).not.toHaveBeenCalled();
    expect(cache.get(user.id)?.username).toBe("wolf");
    expect(refresh).toHaveBeenCalledOnce();
  });

  test("GIVEN a cache that is not a Map THEN the adapter is not iterable", () => {
    const store = createStructureStoreAdapter(
      new NullCache<User, APIUser>((data) => new User(data as APIUser), "users"),
    );

    expect(isIterableCache(store)).toBe(false);
  });
});
