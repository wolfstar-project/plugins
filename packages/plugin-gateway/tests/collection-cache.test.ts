import { Collection } from "@discordjs/collection";
import type { APIUser } from "discord-api-types/v10";
import { describe, expect, test, vi } from "vitest";
import { CollectionCache, User } from "../src/index.js";

const user: APIUser = {
  id: "600000000000000600",
  username: "wolf",
  discriminator: "0",
  global_name: "Wolf",
  avatar: null,
};

function createCache(options?: ConstructorParameters<typeof CollectionCache<User>>[2]) {
  return new CollectionCache<User>((data) => new User(data as APIUser), "users", options);
}

describe("CollectionCache", () => {
  test("GIVEN a new cache THEN it is a synchronous, empty Collection", () => {
    const cache = createCache();

    expect(cache).toBeInstanceOf(Collection);
    expect(cache.synchronous).toBe(true);
    expect(cache.name).toBe("users");
    expect(cache.getSize()).toBe(0);
    expect(cache.get(user.id)).toBeUndefined();
  });

  test("GIVEN add twice THEN the same instance is patched", () => {
    const cache = createCache();

    const first = cache.add(user);
    const second = cache.add({ id: user.id, username: "howl" });

    expect(second).toBe(first);
    expect(first.username).toBe("howl");
    expect(first.globalName).toBe("Wolf");
    expect(cache.getSize()).toBe(1);
  });

  test("GIVEN add with overwrite THEN a new instance replaces the entry", () => {
    const cache = createCache();
    const first = cache.add(user);

    const second = cache.add({ ...user, username: "pup" }, true);

    expect(second).not.toBe(first);
    expect(cache.get(user.id)).toBe(second);
  });

  test("GIVEN keyOf THEN add stores under the derived key", () => {
    const cache = createCache({ keyOf: (data) => `guild:${data.id}` });

    const added = cache.add(user);

    expect(cache.get(`guild:${user.id}`)).toBe(added);
    expect(cache.has(user.id)).toBe(false);
  });

  test("GIVEN refresh THEN get and add pass the instance through it", () => {
    const refresh = vi.fn((value: User) => value);
    const cache = createCache({ refresh });
    const added = cache.add(user);

    // Assert refresh was called once with the newly constructed instance
    expect(refresh).toHaveBeenCalledExactlyOnceWith(added);

    refresh.mockClear();

    // Test get calls refresh
    expect(cache.get(user.id)).toBe(added);
    expect(refresh).toHaveBeenCalledExactlyOnceWith(added);
    expect(cache.get("missing")).toBeUndefined();
    expect(refresh).toHaveBeenCalledTimes(1);

    refresh.mockClear();

    // Test add with existing entry also calls refresh with the patched instance
    const updated = cache.add({ id: user.id, username: "howl" });
    expect(updated).toBe(added);
    expect(refresh).toHaveBeenCalledExactlyOnceWith(updated);
  });

  test("GIVEN maxSize THEN the oldest entry is evicted on insert", () => {
    const cache = createCache({ maxSize: 2 });
    cache.add({ ...user, id: "1" });
    cache.add({ ...user, id: "2" });
    cache.add({ ...user, id: "3" });

    expect([...cache.keys()]).toEqual(["2", "3"]);
    cache.add({ id: "2", username: "howl" });
    expect([...cache.keys()]).toEqual(["2", "3"]);
  });

  test("GIVEN filter THEN the result is a plain Collection", () => {
    const cache = createCache();
    cache.add(user);

    const filtered = cache.filter(() => true);

    expect(filtered).toBeInstanceOf(Collection);
    expect(filtered).not.toBeInstanceOf(CollectionCache);
  });
});
