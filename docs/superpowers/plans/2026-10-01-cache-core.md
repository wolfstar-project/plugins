# Cache core (sub-project A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every `plugin-gateway` manager a discord.js-RFC `Cache<Value>` (`manager.cache.<method>`), built by a client-level `cacheConstructor` that defaults to an in-memory, instance-holding `CollectionCache`, while plugin-cache stores keep working behind the same interface.

**Architecture:** Three `Cache<Value>` implementations: `CollectionCache` (structure instances, synchronous), `EntityStoreCache` (a view over a raw plugin-cache store), `NullCache` (nothing cached). The client resolves one cache per entity name. Dispatches keep writing raw data through `applyGatewayDispatch(client.cache, …)`: with structure caches, `client.cache` is a set of `StructureStoreAdapter`s over them. Managers are split into `BaseManager → DataManager → CachedManager`.

**Tech Stack:** TypeScript 7, vitest, pnpm/turbo, discord-api-types v10, `@discordjs/structures`, `@discordjs/collection`, `@wolfstar/plugin-cache`.

**Spec:** `docs/superpowers/specs/2026-10-01-cache-core-design.md`

**Reference sources** (read before Task 1):

- <https://github.com/Qjuh/discord.js/blob/feat/next-channel-usage/packages/next/src/util/cache.ts>
- <https://github.com/Qjuh/discord.js/blob/feat/next-channel-usage/packages/next/src/Client.ts>
- <https://github.com/Qjuh/discord.js/blob/feat/next-channel-usage/packages/next/src/managers/CachedManager.ts>

## Global Constraints

- Only `packages/plugin-gateway` changes. `@wolfstar/plugin-cache` is not modified and gets no changeset.
- Clean break: no deprecated aliases for `get`, `cached`, `construct`.
- Default (no cache option): every managed entity is cached in memory with `CollectionCache`. `cache: null` disables caching. `cache` / `makeCache` select plugin-cache stores. `cacheConstructor` with `cache` / `makeCache` throws `ClientCacheConflict`.
- `resolveKey(...args)` keeps its signature and behaviour.
- Every `Cache<Value>` method returns `Awaitable` and must stay synchronous when its backing is: use `whenAll`, never `async`, inside cache classes.
- A failing raw store emits `cacheError` and, under `cacheErrors: "miss"`, behaves as a miss.
- Update events keep delivering `(old, new)` with `old !== new`.
- One `minor` changeset for `@wolfstar/plugin-gateway` (breaking under 0.x; the package is at `0.8.0`).
- Comments/JSDoc follow the surrounding style (TSDoc, `@remarks`, `@example`, `@internal`).
- Commits follow Conventional Commits (commitlint hook); the pre-commit hook runs oxfmt + `oxlint --fix`.
- Done = `pnpm lint`, `pnpm build`, `pnpm typecheck`, `pnpm test` all green, from the repo root.

## Review Focus

- `VOICE_STATE_UPDATE` after a member was read once → `member.voice` from a later `members.cache.get` reflects the new state (the `refresh` hook), on the same member instance.
- An update dispatch under `CollectionCache` → the `old` argument of the event keeps the old values (it is a clone taken before the write).
- `channels.cache.get(threadId)` when the thread lives only in the thread cache → resolves the thread.
- `GUILD_DELETE` under `CollectionCache` → the guild's channels, members, roles are gone from the manager caches (cascade through the adapter's iteration).
- `cache: null` → `manager.cache.get` is `undefined`, `fetch` hits REST, dispatches still emit events with `null` previous state.

---

### Task 1: `Cache` types and `CollectionCache`

**Files:**

- Modify: `packages/plugin-gateway/package.json` (dependency)
- Modify: `packages/plugin-gateway/src/util/cache.ts`
- Create: `packages/plugin-gateway/src/util/CollectionCache.ts`
- Modify: `packages/plugin-gateway/src/index.ts`
- Test: `packages/plugin-gateway/tests/collection-cache.test.ts`

**Interfaces:**

- Consumes: `StructureMixin`, `kPatch` from `src/structures/Structure.ts`; `Awaitable`, `CacheEntityName` from `@wolfstar/plugin-cache`.
- Produces:

```ts
// src/util/cache.ts
export type StructureCreator<Value, Raw = RawAPIType<Value>> = (data: Partial<Raw>) => Value;
export interface Cache<Value, Raw = RawAPIType<Value>> {
  readonly synchronous: boolean;
  readonly construct: StructureCreator<Value, Raw>;
  add(data: Partial<Raw>, overwrite?: boolean): Awaitable<Value>;
  clear(): Awaitable<void>;
  delete(key: string): Awaitable<boolean>;
  get(key: string): Awaitable<Value | undefined>;
  getSize(): Awaitable<number>;
  has(key: string): Awaitable<boolean>;
  set(key: string, value: Value): Awaitable<this>;
}
export type CacheConstructor = new <Value extends StructureMixin<object>>(
  creator: StructureCreator<Value>,
  name: CacheEntityName,
  ...args: any[]
) => Cache<Value>;

// src/util/CollectionCache.ts
export interface CollectionCacheOptions<Value, Raw> {
  keyOf?: (data: Partial<Raw>) => string;
  refresh?: (value: Value) => Value;
  maxSize?: number;
}
export class CollectionCache<Value, Raw = RawAPIType<Value>>
  extends Collection<string, Value>
  implements Cache<Value, Raw>
{
  constructor(
    creator: StructureCreator<Value, Raw>,
    name: CacheEntityName,
    options?: CollectionCacheOptions<Value, Raw>,
  );
  readonly name: CacheEntityName;
}
```

- [ ] **Step 1: Add the dependency**

Run (repo root): `pnpm --filter @wolfstar/plugin-gateway add @discordjs/collection@^2.1.1`
Expected: `"@discordjs/collection": "^2.1.1"` under `dependencies` in `packages/plugin-gateway/package.json`.

- [ ] **Step 2: Write the failing test**

Create `packages/plugin-gateway/tests/collection-cache.test.ts`:

```ts
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
    refresh.mockClear();

    expect(cache.get(user.id)).toBe(added);
    expect(refresh).toHaveBeenCalledExactlyOnceWith(added);
    expect(cache.get("missing")).toBeUndefined();
    expect(refresh).toHaveBeenCalledTimes(1);
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
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm vitest run packages/plugin-gateway/tests/collection-cache.test.ts`
Expected: FAIL, `CollectionCache` is not exported from `../src/index.js`.

- [ ] **Step 4: Add the types**

In `packages/plugin-gateway/src/util/cache.ts`, change `StructureCreator`'s parameter to `Partial<Raw>`:

```ts
export type StructureCreator<
  Value extends StructureMixin<object>,
  Raw extends RawAPIType<Value> = RawAPIType<Value>,
> = (data: Partial<Raw>) => Value;
```

and append (import `CacheEntityName` from `@wolfstar/plugin-cache`):

```ts
/**
 * The cache of a manager, as in the discord.js RFC #11426: it hands out {@link StructureMixin | structures}.
 *
 * @remarks
 * Every method is {@link Awaitable}: synchronous on an in-memory cache ({@link Cache.synchronous}), a promise on a
 * remote one. `await` works with both.
 *
 * @typeParam Value The structure the cache hands out.
 * @typeParam Raw The raw API data the structure wraps.
 */
export interface Cache<
  Value extends StructureMixin<object>,
  Raw extends RawAPIType<Value> = RawAPIType<Value>,
> {
  /**
   * Whether every method answers synchronously, never with a promise.
   */
  readonly synchronous: boolean;

  /**
   * The function used to construct instances of the structure this cache holds.
   */
  readonly construct: StructureCreator<Value, Raw>;

  /**
   * Adds or updates data in the cache, returning the instantiated structure. If the item exists, it patches it with
   * the new data unless `overwrite` is true. If it does not exist, it constructs a new instance and stores it.
   */
  add(data: Partial<Raw>, overwrite?: boolean): Awaitable<Value>;

  /**
   * Clears all items from the cache.
   */
  clear(): Awaitable<void>;

  /**
   * Deletes an item from the cache.
   */
  delete(key: string): Awaitable<boolean>;

  /**
   * Retrieves an item from the cache.
   */
  get(key: string): Awaitable<Value | undefined>;

  /**
   * Gets the number of items in the cache.
   */
  getSize(): Awaitable<number>;

  /**
   * Checks if an item exists in the cache.
   */
  has(key: string): Awaitable<boolean>;

  /**
   * Sets an item in the cache.
   */
  set(key: string, value: Value): Awaitable<this>;
}

/**
 * Builds the {@link Cache} of an entity: the `CacheConstructor` of the discord.js RFC #11426, see the client's
 * `cacheConstructor` option.
 */
export type CacheConstructor = new <Value extends StructureMixin<object>>(
  creator: StructureCreator<Value>,
  name: CacheEntityName,
  ...args: any[]
) => Cache<Value>;
```

If the `Partial<Raw>` change breaks existing users of `StructureCreator` in `src/`, cast at those call sites (`data as Raw`); they are removed in Task 4.

- [ ] **Step 5: Implement `CollectionCache`**

Create `packages/plugin-gateway/src/util/CollectionCache.ts`:

```ts
import { Collection } from "@discordjs/collection";
import type { CacheEntityName } from "@wolfstar/plugin-cache";
import { kPatch, type StructureMixin } from "../structures/Structure.js";
import type { Cache, RawAPIType, StructureCreator } from "./cache.js";

/**
 * The options of {@link CollectionCache}.
 */
export interface CollectionCacheOptions<Value, Raw> {
  /**
   * Gets the key of raw data, for {@link CollectionCache.add}.
   *
   * @default (data) => data.id
   */
  keyOf?: (data: Partial<Raw>) => string;
  /**
   * Called with an instance every time it is read with `get` or updated with `add`, to bring what it holds besides
   * its data (its relations) up to date. It returns the instance to hand out.
   */
  refresh?: (value: Value) => Value;
  /**
   * The maximum amount of entries, the oldest one being evicted when a new one would exceed it.
   *
   * @default Infinity
   */
  maxSize?: number;
}

/**
 * The default {@link Cache}: an in-memory `Collection` of structure instances, like discord.js's caches.
 *
 * @remarks
 * `add` patches the cached instance in place, so a reference kept by the application sees later updates.
 *
 * Every method is synchronous. Being a `Collection`, it also has `find`, `filter`, `map`, ... which return plain
 * collections. Instances reached by iterating carry the relations of their last `get`.
 */
export class CollectionCache<
  Value extends StructureMixin<object>,
  Raw extends RawAPIType<Value> = RawAPIType<Value>,
>
  extends Collection<string, Value>
  implements Cache<Value, Raw>
{
  public static override get [Symbol.species](): typeof Collection {
    return Collection;
  }

  public readonly synchronous = true;

  public readonly construct: StructureCreator<Value, Raw>;

  /**
   * The name of the entity this cache holds.
   */
  public readonly name: CacheEntityName;

  readonly #keyOf: (data: Partial<Raw>) => string;

  readonly #refresh: ((value: Value) => Value) | undefined;

  readonly #maxSize: number;

  public constructor(
    creator: StructureCreator<Value, Raw>,
    name: CacheEntityName,
    options: CollectionCacheOptions<Value, Raw> = {},
  ) {
    super();
    this.construct = creator;
    this.name = name;
    this.#keyOf = options.keyOf ?? ((data) => (data as { id: string }).id);
    this.#refresh = options.refresh;
    this.#maxSize = options.maxSize ?? Infinity;
  }

  public add(data: Partial<Raw>, overwrite = false): Value {
    const key = this.#keyOf(data);
    const existing = overwrite ? undefined : super.get(key);
    if (existing !== undefined) {
      existing[kPatch](data as never);
      return this.#refresh ? this.#refresh(existing) : existing;
    }

    const value = this.construct(data);
    this.set(key, value);
    return value;
  }

  public override get(key: string): Value | undefined {
    const value = super.get(key);
    return value !== undefined && this.#refresh ? this.#refresh(value) : value;
  }

  public override set(key: string, value: Value): this {
    if (this.size >= this.#maxSize && !super.has(key)) {
      const oldest = this.keys().next();
      if (!oldest.done) super.delete(oldest.value);
    }

    return super.set(key, value);
  }

  public getSize(): number {
    return this.size;
  }
}
```

In `packages/plugin-gateway/src/index.ts`, add `export * from "./util/CollectionCache.js";` next to the other `util` exports.

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm vitest run packages/plugin-gateway/tests/collection-cache.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 7: Commit**

```bash
git add packages/plugin-gateway/package.json pnpm-lock.yaml packages/plugin-gateway/src/util/cache.ts packages/plugin-gateway/src/util/CollectionCache.ts packages/plugin-gateway/src/index.ts packages/plugin-gateway/tests/collection-cache.test.ts
git commit -m "feat(plugin-gateway): add the Cache interface and CollectionCache"
```

---

### Task 2: `EntityStoreCache` and `NullCache`

**Files:**

- Modify: `packages/plugin-gateway/src/util/events.ts:66`
- Create: `packages/plugin-gateway/src/util/EntityStoreCache.ts`
- Create: `packages/plugin-gateway/src/util/NullCache.ts`
- Modify: `packages/plugin-gateway/src/index.ts`
- Test: `packages/plugin-gateway/tests/entity-store-cache.test.ts`

**Interfaces:**

- Consumes: `Cache`, `StructureCreator`, `whenAll` (Task 1 / existing).
- Produces:

```ts
export type CacheGuard = <T>(
  operation: CacheErrorContext["operation"],
  key: string | null,
  run: () => Awaitable<T>,
  fallback: T,
) => Awaitable<T>;
export interface EntityStoreCacheOptions<Value, Raw> {
  store: EntityCache<Raw>;
  keyOf: (data: Partial<Raw>) => string;
  /** Builds a structure with its relations; may be asynchronous. Defaults to the creator. */
  hydrate?: (data: Raw) => Awaitable<Value>;
  guard?: CacheGuard;
}
export class EntityStoreCache<Value, Raw> implements Cache<Value, Raw> {
  constructor(
    creator: StructureCreator<Value, Raw>,
    name: CacheEntityName,
    options: EntityStoreCacheOptions<Value, Raw>,
  );
  readonly name: CacheEntityName;
  readonly store: EntityCache<Raw>;
}
export class NullCache<Value, Raw> implements Cache<Value, Raw> {
  constructor(creator: StructureCreator<Value, Raw>, name: CacheEntityName);
}
```

- [ ] **Step 1: Write the failing test**

Create `packages/plugin-gateway/tests/entity-store-cache.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run packages/plugin-gateway/tests/entity-store-cache.test.ts`
Expected: FAIL, `EntityStoreCache` is not exported.

- [ ] **Step 3: Implement**

In `packages/plugin-gateway/src/util/events.ts`, widen `CacheErrorContext`:

```ts
operation: "get" | "set" | "upsert" | "delete" | "has" | "clear" | "getSize";
```

Create `packages/plugin-gateway/src/util/EntityStoreCache.ts`:

```ts
import type { Awaitable, CacheEntityName, EntityCache } from "@wolfstar/plugin-cache";
import type { StructureMixin } from "../structures/Structure.js";
import { whenAll, type Cache, type RawAPIType, type StructureCreator } from "./cache.js";
import type { CacheErrorContext } from "./events.js";

/**
 * Runs a store operation, reporting its failure and resolving it to a fallback or rethrowing it.
 */
export type CacheGuard = <T>(
  operation: CacheErrorContext["operation"],
  key: string | null,
  run: () => Awaitable<T>,
  fallback: T,
) => Awaitable<T>;

/**
 * The options of {@link EntityStoreCache}.
 */
export interface EntityStoreCacheOptions<Value, Raw> {
  /**
   * The raw store.
   */
  store: EntityCache<Raw>;
  /**
   * Gets the key of raw data, for {@link EntityStoreCache.add}.
   */
  keyOf: (data: Partial<Raw>) => string;
  /**
   * Builds the structure of raw data read from the store, with its relations. May be asynchronous.
   *
   * @default The creator.
   */
  hydrate?: (data: Raw) => Awaitable<Value>;
  /**
   * Guards every store call.
   *
   * @default Lets errors through.
   */
  guard?: CacheGuard;
}

const unguarded: CacheGuard = (_operation, _key, run) => run();

/**
 * A {@link Cache} over a raw `@wolfstar/plugin-cache` store (in memory or Redis): the store holds raw API data, and a
 * structure is built on every read.
 *
 * @remarks
 * Unlike `CollectionCache`, two reads of the same key return two structures: do not rely on object identity.
 */
export class EntityStoreCache<
  Value extends StructureMixin<object>,
  Raw extends RawAPIType<Value> = RawAPIType<Value>,
> implements Cache<Value, Raw> {
  public readonly construct: StructureCreator<Value, Raw>;

  /**
   * The name of the entity this cache holds.
   */
  public readonly name: CacheEntityName;

  /**
   * The raw store.
   */
  public readonly store: EntityCache<Raw>;

  readonly #keyOf: (data: Partial<Raw>) => string;

  readonly #hydrate: (data: Raw) => Awaitable<Value>;

  readonly #guard: CacheGuard;

  public constructor(
    creator: StructureCreator<Value, Raw>,
    name: CacheEntityName,
    options: EntityStoreCacheOptions<Value, Raw>,
  ) {
    this.construct = creator;
    this.name = name;
    this.store = options.store;
    this.#keyOf = options.keyOf;
    this.#hydrate = options.hydrate ?? creator;
    this.#guard = options.guard ?? unguarded;
  }

  public get synchronous(): boolean {
    return this.store.synchronous === true;
  }

  public add(data: Partial<Raw>, overwrite = false): Awaitable<Value> {
    const raw = data as Raw;
    const key = this.#keyOf(data);
    return whenAll(
      [
        this.#guard("upsert", key, () => this.store.upsert(key, data, { overwrite }), {
          added: raw,
        }),
      ],
      ([{ added }]) => this.#hydrate(added),
    );
  }

  public clear(): Awaitable<void> {
    return this.#guard("clear", null, () => this.store.clear(), undefined);
  }

  public delete(key: string): Awaitable<boolean> {
    return this.#guard("delete", key, () => this.store.delete(key), false);
  }

  public get(key: string): Awaitable<Value | undefined> {
    return whenAll([this.#guard("get", key, () => this.store.get(key), undefined)], ([raw]) =>
      raw === undefined ? undefined : this.#hydrate(raw),
    );
  }

  public getSize(): Awaitable<number> {
    return this.#guard("getSize", null, () => this.store.getSize(), 0);
  }

  public has(key: string): Awaitable<boolean> {
    return this.#guard("has", key, () => this.store.has(key), false);
  }

  public set(key: string, value: Value): Awaitable<this> {
    const raw = (value as unknown as { toJSON(): Raw }).toJSON();
    return whenAll(
      [this.#guard("set", key, () => this.store.set(key, raw), undefined)],
      () => this,
    );
  }
}
```

Create `packages/plugin-gateway/src/util/NullCache.ts`:

```ts
import type { CacheEntityName } from "@wolfstar/plugin-cache";
import type { StructureMixin } from "../structures/Structure.js";
import type { Cache, RawAPIType, StructureCreator } from "./cache.js";

/**
 * The {@link Cache} of an entity that is not cached: always empty, writes are dropped.
 */
export class NullCache<
  Value extends StructureMixin<object>,
  Raw extends RawAPIType<Value> = RawAPIType<Value>,
> implements Cache<Value, Raw> {
  public readonly synchronous = true;

  public readonly construct: StructureCreator<Value, Raw>;

  /**
   * The name of the entity this cache stands for.
   */
  public readonly name: CacheEntityName;

  public constructor(creator: StructureCreator<Value, Raw>, name: CacheEntityName) {
    this.construct = creator;
    this.name = name;
  }

  public add(data: Partial<Raw>): Value {
    return this.construct(data);
  }

  public clear(): void {}

  public delete(): boolean {
    return false;
  }

  public get(): undefined {
    return undefined;
  }

  public getSize(): number {
    return 0;
  }

  public has(): boolean {
    return false;
  }

  public set(): this {
    return this;
  }
}
```

Export both from `packages/plugin-gateway/src/index.ts` (`export * from "./util/EntityStoreCache.js";`, `export * from "./util/NullCache.js";`).

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run packages/plugin-gateway/tests/entity-store-cache.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/plugin-gateway/src/util/events.ts packages/plugin-gateway/src/util/EntityStoreCache.ts packages/plugin-gateway/src/util/NullCache.ts packages/plugin-gateway/src/index.ts packages/plugin-gateway/tests/entity-store-cache.test.ts
git commit -m "feat(plugin-gateway): add EntityStoreCache and NullCache"
```

---

### Task 3: `StructureStoreAdapter`

**Files:**

- Create: `packages/plugin-gateway/src/util/StructureStoreAdapter.ts` (internal, not exported from `index.ts`)
- Test: `packages/plugin-gateway/tests/structure-store-adapter.test.ts`

**Interfaces:**

- Consumes: `Cache`, `CollectionCache` (Task 1); `EntityCache`, `IterableEntityCache`, `CacheUpsertResult`, `CacheUpsertOptions` from `@wolfstar/plugin-cache`.
- Produces:

```ts
/** A raw store over a structure cache. Iterable when the cache is a `Map` (e.g. `CollectionCache`). */
export function createStructureStoreAdapter<Value, Raw>(cache: Cache<Value, Raw>): EntityCache<Raw>;
```

- [ ] **Step 1: Write the failing test**

Create `packages/plugin-gateway/tests/structure-store-adapter.test.ts`:

```ts
import { isIterableCache } from "@wolfstar/plugin-cache";
import type { APIUser } from "discord-api-types/v10";
import { describe, expect, test } from "vitest";
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

  test("GIVEN a cache that is not a Map THEN the adapter is not iterable", () => {
    const store = createStructureStoreAdapter(
      new NullCache<User, APIUser>((data) => new User(data as APIUser), "users"),
    );

    expect(isIterableCache(store)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run packages/plugin-gateway/tests/structure-store-adapter.test.ts`
Expected: FAIL, cannot resolve `../src/util/StructureStoreAdapter.js`.

- [ ] **Step 3: Implement**

Create `packages/plugin-gateway/src/util/StructureStoreAdapter.ts`:

```ts
import type {
  Awaitable,
  CacheUpsertOptions,
  CacheUpsertResult,
  EntityCache,
  IterableEntityCache,
} from "@wolfstar/plugin-cache";
import { kPatch, type StructureMixin } from "../structures/Structure.js";
import { whenAll, type Cache, type RawAPIType } from "./cache.js";

function toRaw<Raw>(value: StructureMixin<object>): Raw {
  // A copy: the structure's own data keeps changing as it is patched.
  return { ...(value as unknown as { toJSON(): Raw }).toJSON() };
}

/**
 * A raw `@wolfstar/plugin-cache` store over a structure {@link Cache}, so that what writes raw data (the gateway
 * dispatches, their cascades, the policies) works against a cache of structures.
 *
 * @remarks
 * Writes patch the cached instance in place. Time-to-live options are ignored: structure caches have none.
 *
 * @internal
 */
class StructureStoreAdapter<
  Value extends StructureMixin<object>,
  Raw extends RawAPIType<Value>,
> implements EntityCache<Raw> {
  public constructor(protected readonly cache: Cache<Value, Raw>) {}

  public get synchronous(): boolean {
    return this.cache.synchronous;
  }

  public get(key: string): Awaitable<Raw | undefined> {
    return whenAll([this.cache.get(key)], ([value]) =>
      value === undefined ? undefined : toRaw<Raw>(value),
    );
  }

  public set(key: string, value: Raw): Awaitable<void> {
    return whenAll([this.cache.set(key, this.cache.construct(value))], () => undefined);
  }

  public upsert(
    key: string,
    data: Partial<Raw>,
    options?: CacheUpsertOptions,
  ): Awaitable<CacheUpsertResult<Raw>> {
    return whenAll([this.cache.get(key)], ([existing]) => {
      if (existing === undefined || options?.overwrite) {
        const before = existing === undefined ? undefined : toRaw<Raw>(existing);
        const value = this.cache.construct(data);
        return whenAll([this.cache.set(key, value)], () => ({
          existing: before,
          added: toRaw<Raw>(value),
        }));
      }

      const before = toRaw<Raw>(existing);
      existing[kPatch](data as never);
      // Written back for caches that do not hold the instance itself.
      return whenAll([this.cache.set(key, existing)], () => ({
        existing: before,
        added: toRaw<Raw>(existing),
      }));
    });
  }

  public has(key: string): Awaitable<boolean> {
    return this.cache.has(key);
  }

  public delete(key: string): Awaitable<boolean> {
    return this.cache.delete(key);
  }

  public clear(): Awaitable<void> {
    return this.cache.clear();
  }

  public getSize(): Awaitable<number> {
    return this.cache.getSize();
  }
}

class IterableStructureStoreAdapter<
  Value extends StructureMixin<object>,
  Raw extends RawAPIType<Value>,
>
  extends StructureStoreAdapter<Value, Raw>
  implements IterableEntityCache<Raw>
{
  declare protected readonly cache: Cache<Value, Raw> & Map<string, Value>;

  public keys(): string[] {
    return [...this.cache.keys()];
  }

  public values(): Raw[] {
    return [...this.cache.values()].map((value) => toRaw<Raw>(value));
  }

  public entries(): [key: string, value: Raw][] {
    return [...this.cache.entries()].map(([key, value]) => [key, toRaw<Raw>(value)]);
  }
}

/**
 * Creates the raw store of a structure cache, enumerable when the cache is a `Map` (e.g. `CollectionCache`).
 *
 * @param cache The structure cache.
 * @internal
 */
export function createStructureStoreAdapter<
  Value extends StructureMixin<object>,
  Raw extends RawAPIType<Value> = RawAPIType<Value>,
>(cache: Cache<Value, Raw>): EntityCache<Raw> {
  return cache instanceof Map
    ? new IterableStructureStoreAdapter<Value, Raw>(cache)
    : new StructureStoreAdapter<Value, Raw>(cache);
}
```

Note `set` builds a new instance (an overwrite), while `upsert` patches: that is the raw store contract (`set` replaces, `upsert` merges).

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run packages/plugin-gateway/tests/structure-store-adapter.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/plugin-gateway/src/util/StructureStoreAdapter.ts packages/plugin-gateway/tests/structure-store-adapter.test.ts
git commit -m "feat(plugin-gateway): add the raw adapter over structure caches"
```

---

### Task 4: Manager hierarchy, client wiring, and every `src/` call site

This task changes the public API, so all of `src/` moves together. It ends with `pnpm typecheck` green and the manager-level suites passing; the remaining suites are migrated in Task 5 and are expected to be red in between.

**Files:**

- Create: `packages/plugin-gateway/src/managers/BaseManager.ts`, `packages/plugin-gateway/src/managers/DataManager.ts`
- Create: `packages/plugin-gateway/src/util/entityManagers.ts`
- Modify: `packages/plugin-gateway/src/managers/CachedManager.ts` (rewrite), `packages/plugin-gateway/src/managers/index.ts`
- Modify: `packages/plugin-gateway/src/managers/ChannelManager.ts` (thread-aware cache)
- Modify: the 17 other `CachedManager` subclasses and the 11 contextual managers in `packages/plugin-gateway/src/managers/`
- Modify: `packages/plugin-gateway/src/GatewayClient.ts` (options, resolution, `CacheConstructor`)
- Modify: `packages/plugin-gateway/src/util/dispatch.ts` (call sites, `before` clones), `src/util/auditLogs.ts`, `src/util/Transformers.ts`, `src/util/Util.ts`, `src/structures/**`
- Modify: `packages/plugin-gateway/src/errors/Messages.ts`
- Test: `packages/plugin-gateway/tests/cached-manager.test.ts`, `packages/plugin-gateway/tests/zero-cache.test.ts`, `packages/plugin-gateway/tests/client-cache.test.ts` (new)

**Interfaces:**

- Consumes: Tasks 1–3.
- Produces:

```ts
// managers/BaseManager.ts
export abstract class BaseManager {
  public readonly client: GatewayClient;
  constructor(client: GatewayClient);
}

// managers/DataManager.ts
export abstract class DataManager<
  Value extends StructureMixin<object>,
  Args extends readonly string[],
> extends BaseManager {
  public abstract readonly cache: Cache<Value>;
  public abstract resolveKey(...args: Args): string;
  public resolve(value: Value | string): Awaitable<Value | null>;
  public resolveId(value: Value | string): string | null;
}

// managers/CachedManager.ts
export interface AddOptions {
  id?: string;
  extras?: unknown[];
}
export abstract class CachedManager<Name extends CacheEntityName, Value, Args> extends DataManager<
  Value,
  Args
> {
  public readonly cache: Cache<Value>;
  protected readonly name: Name;
  protected abstract createStructure(data: CacheEntityTypes[Name], ...extras: unknown[]): Value;
  public abstract keyOf(data: CacheEntityTypes[Name]): string;
  public _add(data: CacheEntityTypes[Name], cache?: boolean, options?: AddOptions): Promise<Value>;
  public _hydrate(data: CacheEntityTypes[Name], ...extras: unknown[]): Awaitable<Value>; // @internal
  public _build(data: CacheEntityTypes[Name], extras?: unknown[]): Awaitable<Value>; // @internal, _hydrate + bindClient
  public _resolveData(data: CacheEntityTypes[Name]): Awaitable<Value>; // @internal
  public fetch(...args: [...Args] | [...Args, FetchOptions]): Promise<Value>;
  public refresh(...args: Args): Promise<Value>;
}

// util/entityManagers.ts
export type ManagedEntityName =
  | "autoModerationRules"
  | "bans"
  | "channels"
  | "emojis"
  | "guilds"
  | "integrations"
  | "invites"
  | "members"
  | "messages"
  | "presences"
  | "roles"
  | "scheduledEvents"
  | "soundboardSounds"
  | "stageInstances"
  | "stickers"
  | "threadMembers"
  | "threads"
  | "users"
  | "voiceStates";
export const ManagedEntityNames: readonly ManagedEntityName[];
export function managerOf(
  client: GatewayClient,
  name: ManagedEntityName,
  data: object,
): CachedManager<any, any, any>;

// GatewayClient
interface GatewayClientOptions {
  cacheConstructor?: CacheConstructor;
  cache?: PluginCache | null; /* makeCache, policies unchanged */
}
class GatewayClient {
  public CacheConstructor<Value>(
    creator: StructureCreator<Value>,
    name: CacheEntityName,
  ): Cache<Value>;
  public readonly cache: PluginCache | undefined;
}
```

- [ ] **Step 1: Write the failing tests**

Create `packages/plugin-gateway/tests/client-cache.test.ts`:

```ts
import { WebSocketShardEvents } from "@discordjs/ws";
import {
  createInMemoryCache,
  MemoryEntityCache,
  type Cache as PluginCache,
} from "@wolfstar/plugin-cache";
import {
  GatewayDispatchEvents,
  GatewayOpcodes,
  type APIUser,
  type GatewayDispatchPayload,
} from "discord-api-types/v10";
import { describe, expect, test } from "vitest";
import {
  BaseManager,
  CachedManager,
  CollectionCache,
  DataManager,
  EntityStoreCache,
  GatewayClient,
  GatewayErrorCodes,
  kClone,
  NullCache,
  User,
  type CacheConstructor,
  type GatewayClientOptions,
} from "../src/index.js";

const guildId = "100000000000000010";
const user: APIUser = {
  id: "600000000000000600",
  username: "wolf",
  discriminator: "0",
  global_name: "Wolf",
  avatar: null,
};

function createClient(options: Partial<GatewayClientOptions> = {}) {
  return new GatewayClient({
    discordPublicKey: "0".repeat(64),
    discordToken: "test-token",
    clientId: "266624760782258186",
    intents: 0,
    ...options,
  });
}

async function dispatch(client: GatewayClient, t: GatewayDispatchEvents, d: unknown) {
  const payload = { op: GatewayOpcodes.Dispatch, s: 1, t, d } as GatewayDispatchPayload;
  client.gateway.emit(WebSocketShardEvents.Dispatch, payload, 0);
  await client.idle();
}

describe("GatewayClient cache resolution", () => {
  test("GIVEN no cache option THEN every manager gets a CollectionCache", () => {
    const client = createClient();

    expect(client.users.cache).toBeInstanceOf(CollectionCache);
    expect(client.members.cache).toBeInstanceOf(CollectionCache);
    expect(client.cache?.users).toBeDefined();
  });

  test("GIVEN cache null THEN nothing is cached", () => {
    const client = createClient({ cache: null });

    expect(client.users.cache).toBeInstanceOf(NullCache);
    expect(client.cache).toBeUndefined();
  });

  test("GIVEN a plugin-cache cache THEN managers view its stores", async () => {
    const cache: PluginCache = createInMemoryCache({ entities: ["users"] });
    const client = createClient({ cache });

    expect(client.users.cache).toBeInstanceOf(EntityStoreCache);
    expect(client.guilds.cache).toBeInstanceOf(NullCache);
    await cache.users!.set(user.id, user);
    expect((await client.users.cache.get(user.id))?.username).toBe("wolf");
  });

  test("GIVEN makeCache THEN it selects the stores", () => {
    const client = createClient({
      makeCache: (entity) => (entity === "users" ? new MemoryEntityCache() : null),
    });

    expect(client.users.cache).toBeInstanceOf(EntityStoreCache);
    expect(client.guilds.cache).toBeInstanceOf(NullCache);
  });

  test("GIVEN a cacheConstructor THEN it builds every manager cache", () => {
    class Custom extends CollectionCache<never> {}
    const client = createClient({ cacheConstructor: Custom as unknown as CacheConstructor });

    expect(client.users.cache).toBeInstanceOf(Custom);
  });

  test("GIVEN cacheConstructor with cache THEN the client refuses to start", () => {
    expect(() =>
      createClient({ cacheConstructor: CollectionCache as never, cache: createInMemoryCache() }),
    ).toThrow(expect.objectContaining({ code: GatewayErrorCodes.ClientCacheConflict }));
  });

  test("GIVEN guild-scoped managers THEN they share one cache per entity", () => {
    const client = createClient();

    expect(client.guilds.emojis(guildId).cache).toBe(client.guilds.emojis("2").cache);
    expect(client.CacheConstructor(() => new User(user), "users")).toBe(client.users.cache);
  });

  test("GIVEN the hierarchy THEN managers extend BaseManager, DataManager, and CachedManager", () => {
    const client = createClient();

    expect(client.users).toBeInstanceOf(CachedManager);
    expect(client.users).toBeInstanceOf(DataManager);
    expect(client.users).toBeInstanceOf(BaseManager);
    expect(client.webhooks).toBeInstanceOf(BaseManager);
    expect(client.webhooks).not.toBeInstanceOf(DataManager);
  });
});

describe("instance identity", () => {
  test("GIVEN _add twice THEN the cached instance is patched", async () => {
    const client = createClient();

    const first = await client.users._add(user);
    const second = await client.users._add({ ...user, username: "howl" });

    expect(second).toBe(first);
    expect(client.users.cache.get(user.id)).toBe(first);
    expect(first.username).toBe("howl");
  });

  test("GIVEN _add with cache false THEN a patched clone is returned and the cache untouched", async () => {
    const client = createClient();
    const cached = await client.users._add(user);

    const clone = await client.users._add({ ...user, username: "howl" }, false);

    expect(clone).not.toBe(cached);
    expect(clone.username).toBe("howl");
    expect(cached.username).toBe("wolf");
  });

  test("GIVEN a dispatch THEN the cached instance is patched in place", async () => {
    const client = createClient();
    const cached = await client.users._add(user);

    await dispatch(client, GatewayDispatchEvents.UserUpdate, { ...user, username: "howl" });

    expect(client.users.cache.get(user.id)).toBe(cached);
    expect(cached.username).toBe("howl");
  });

  test("GIVEN an update dispatch THEN the event receives the previous state as a separate object", async () => {
    const client = createClient();
    await client.users._add(user);
    const seen: [string | undefined, string][] = [];
    client.on("userUpdate", (old, updated) => seen.push([old?.username, updated.username]));

    await dispatch(client, GatewayDispatchEvents.UserUpdate, { ...user, username: "howl" });

    expect(seen).toEqual([["wolf", "howl"]]);
  });

  test("GIVEN resolve and resolveId THEN they follow discord.js", async () => {
    const client = createClient();
    const cached = await client.users._add(user);

    expect(await client.users.resolve(cached)).toBe(cached);
    expect(await client.users.resolve(user.id)).toBe(cached);
    expect(await client.users.resolve("missing")).toBeNull();
    expect(client.users.resolveId(cached)).toBe(user.id);
    expect(client.users.resolveId(user.id)).toBe(user.id);
    expect(client.users.resolveId(null as never)).toBeNull();
    expect(cached[kClone]()).not.toBe(cached);
  });
});
```

If `userUpdate` is not the event name `GatewayEvents` uses for `USER_UPDATE` (check `src/util/events.ts`), use that file's name and argument order.

In `packages/plugin-gateway/tests/cached-manager.test.ts` and `zero-cache.test.ts`:

1. Apply the migration table of Step 7.
2. `createClient` factories that passed `cache: undefined` to mean "no cache" pass `cache: null`.
3. Delete tests asserting `BaseManager === CachedManager`, and the `cached()` tests asserting `CacheRelationsAsynchronous`. Replace the latter with:

```ts
test("GIVEN a Redis cache THEN cache.get answers with a promise", async () => {
  const client = createClient({ cache: createRedisCache(new FakeRedis() as never) });
  await client.cache!.users!.set(user.id, user);

  expect(client.users.cache.synchronous).toBe(false);
  const cached = client.users.cache.get(user.id);
  expect(cached).toBeInstanceOf(Promise);
  expect((await cached)?.username).toBe("wolf");
});
```

(reuse the file's existing Redis construction if it differs).

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run packages/plugin-gateway/tests/client-cache.test.ts`
Expected: FAIL, `DataManager` / `NullCache` wiring does not exist yet.

- [ ] **Step 3: `BaseManager` and `DataManager`**

Create `packages/plugin-gateway/src/managers/BaseManager.ts`:

```ts
import type { GatewayClient } from "../GatewayClient.js";

/**
 * Manages the API methods of a data model, like discord.js's `BaseManager`.
 */
export abstract class BaseManager {
  /**
   * The client that instantiated this manager.
   */
  public readonly client: GatewayClient;

  public constructor(client: GatewayClient) {
    this.client = client;
  }
}
```

Create `packages/plugin-gateway/src/managers/DataManager.ts`:

```ts
import type { Awaitable } from "@wolfstar/plugin-cache";
import type { StructureMixin } from "../structures/Structure.js";
import { whenAll, type Cache } from "../util/cache.js";
import { BaseManager } from "./BaseManager.js";

/**
 * Manages the API methods of a data model along with a collection of instances, like discord.js's `DataManager`.
 *
 * @typeParam Value The structure this manager holds.
 * @typeParam Args The arguments identifying an entity, e.g. `[id]` or `[guildId, userId]`.
 */
export abstract class DataManager<
  Value extends StructureMixin<object>,
  Args extends readonly string[],
> extends BaseManager {
  /**
   * The cache of the items this manager holds.
   */
  public abstract readonly cache: Cache<Value>;

  /**
   * Gets the cache key of an entity, the one {@link DataManager.cache} takes.
   *
   * @param args The arguments identifying the entity.
   */
  public abstract resolveKey(...args: Args): string;

  /**
   * Resolves a structure or a cache key to a structure.
   *
   * @param value A structure, returned as is, or the cache key of an entity (its ID, for managers keyed by ID).
   * @returns The structure, or `null` if the key is not cached.
   */
  public resolve(value: Value | string): Awaitable<Value | null> {
    if (typeof value !== "string") return value ?? null;
    return whenAll([this.cache.get(value)], ([cached]) => cached ?? null);
  }

  /**
   * Resolves a structure or an ID to an ID.
   *
   * @param value A structure, or an ID.
   * @returns The ID, or `null` if the value is neither.
   */
  public resolveId(value: Value | string): string | null {
    if (typeof value === "string") return value;
    const id = (value as { id?: unknown } | null)?.id;
    return typeof id === "string" ? id : null;
  }
}
```

Export both from `packages/plugin-gateway/src/managers/index.ts`.

- [ ] **Step 4: The entity registry**

Create `packages/plugin-gateway/src/util/entityManagers.ts`:

```ts
import type { GatewayClient } from "../GatewayClient.js";
import type { CachedManager } from "../managers/CachedManager.js";

/**
 * The entities of `@wolfstar/plugin-cache` a manager builds structures for.
 *
 * @internal
 */
export const ManagedEntityNames = [
  "autoModerationRules",
  "bans",
  "channels",
  "emojis",
  "guilds",
  "integrations",
  "invites",
  "members",
  "messages",
  "presences",
  "roles",
  "scheduledEvents",
  "soundboardSounds",
  "stageInstances",
  "stickers",
  "threadMembers",
  "threads",
  "users",
  "voiceStates",
] as const;

export type ManagedEntityName = (typeof ManagedEntityNames)[number];

type AnyManager = CachedManager<any, any, any>;

function guildIdOf(data: object): string {
  return (data as { guild_id?: string }).guild_id ?? "";
}

const managers: {
  [Name in ManagedEntityName]: (client: GatewayClient, data: object) => AnyManager;
} = {
  autoModerationRules: (client, data) => client.guilds.autoModerationRules(guildIdOf(data)),
  bans: (client, data) => client.guilds.bans(guildIdOf(data)),
  channels: (client) => client.channels,
  emojis: (client, data) => client.guilds.emojis(guildIdOf(data)),
  guilds: (client) => client.guilds,
  integrations: (client, data) => client.guilds.integrations(guildIdOf(data)),
  invites: (client, data) => client.guilds.invites(guildIdOf(data)),
  members: (client) => client.members,
  messages: (client) => client.messages,
  presences: (client) => client.presences,
  roles: (client) => client.roles,
  scheduledEvents: (client, data) => client.guilds.scheduledEvents(guildIdOf(data)),
  soundboardSounds: (client, data) => client.guilds.soundboardSounds(guildIdOf(data)),
  stageInstances: (client, data) => client.guilds.stageInstances(guildIdOf(data)),
  stickers: (client, data) => client.guilds.stickers(guildIdOf(data)),
  threadMembers: (client) => client.threadMembers,
  threads: (client) => client.threads,
  users: (client) => client.users,
  voiceStates: (client) => client.voiceStates,
};

/**
 * Gets the manager building the structures of an entity. Guild-scoped managers are created for the guild the data
 * belongs to.
 *
 * @param client The client.
 * @param name The name of the entity.
 * @param data The raw data the manager is needed for.
 * @internal
 */
export function managerOf(
  client: GatewayClient,
  name: ManagedEntityName,
  data: object,
): AnyManager {
  return managers[name](client, data);
}
```

Check each accessor name against `GuildManager` (`grep -n "public [a-zA-Z]*(guildId: string)" packages/plugin-gateway/src/managers/GuildManager.ts`) and fix any that differs. For each guild-scoped entity, confirm its `CacheEntityTypes[...]` carries `guild_id` (see `packages/plugin-cache/src/lib/types.ts:44-71`); where it is optional or absent (`soundboardSounds`, `invites`), the manager's `keyOf` must not need `this.guildId` for data lacking it — if it does, make `keyOf` read `data.guild_id ?? this.guildId`.

- [ ] **Step 5: Rewrite `CachedManager`**

Replace the class in `packages/plugin-gateway/src/managers/CachedManager.ts` (keep `FetchOptions`):

````ts
import {
  isIterableCache,
  type Awaitable,
  type CacheEntityName,
  type CacheEntityTypes,
  type EntityCache,
  type IterableEntityCache,
} from "@wolfstar/plugin-cache";
import type { GatewayClient } from "../GatewayClient.js";
import type { Guild } from "../structures/guilds/Guild.js";
import { bindClient, kClone, kPatch, type StructureMixin } from "../structures/Structure.js";
import { isPromiseLike, whenAll, type Cache } from "../util/cache.js";
import type { CacheErrorContext } from "../util/events.js";
import { GatewayTypeError } from "../errors/GatewayError.js";
import { DataManager } from "./DataManager.js";

/**
 * The options of {@link CachedManager._add}.
 */
export interface AddOptions {
  /**
   * The cache key of the entity, when it cannot be derived from its data.
   */
  id?: string;
  /**
   * Extra arguments handed to the manager's `createStructure`.
   */
  extras?: unknown[];
}

/**
 * Manages the API methods of a data model with a mutable cache of instances: the `CachedManager` of the discord.js
 * RFC #11426.
 *
 * @remarks
 * Reads go through {@link CachedManager.cache}: `client.users.cache.get(id)`. The cache is built by the client's
 * `cacheConstructor` (`CollectionCache` by default) and shared by every manager of the same entity.
 *
 * Caches keyed by more than an ID take the key built by `resolveKey`:
 * `client.members.cache.get(client.members.resolveKey(guildId, userId))`.
 *
 * @typeParam Name The name of the entity this manager holds.
 * @typeParam Value The structure this manager builds.
 * @typeParam Args The arguments identifying an entity, e.g. `[id]` or `[guildId, userId]`.
 */
export abstract class CachedManager<
  Name extends CacheEntityName,
  Value extends StructureMixin<object>,
  Args extends readonly string[],
> extends DataManager<Value, Args> {
  /**
   * The cache of this manager's entity.
   *
   * @example
   * ```typescript
   * const user = await client.users.cache.get(userId);
   * ```
   */
  public readonly cache: Cache<Value>;

  /**
   * The name of the entity this manager holds.
   */
  protected readonly name: Name;

  /**
   * Wraps raw data in this manager's structure: the RFC's `StructureCreator`.
   *
   * @param data The raw data.
   * @param extras The extra arguments passed to {@link CachedManager._add}.
   */
  protected abstract createStructure(data: CacheEntityTypes[Name], ...extras: unknown[]): Value;

  public constructor(client: GatewayClient, name: Name) {
    super(client);
    this.name = name;
    this.cache = this.createCache();
  }

  /**
   * Gets {@link CachedManager.cache} from the client. Managers whose entity spans several caches override it.
   */
  protected createCache(): Cache<Value> {
    return this.client.CacheConstructor<Value>(
      (data) => this.createStructure(data as CacheEntityTypes[Name]),
      this.name,
    );
  }

  /**
   * The raw store of this manager's entity, or `undefined` when it is not cached.
   */
  protected get store(): EntityCache<CacheEntityTypes[Name]> | undefined {
    return this.client.cache?.[this.name] as EntityCache<CacheEntityTypes[Name]> | undefined;
  }

  /**
   * Adds an API payload to the cache and returns its structure, as in the RFC.
   *
   * @remarks
   * A cached entry is patched and returned: with a cache of instances (`CollectionCache`), that is the very instance
   * the application may already hold. With `cache` set to `false`, a patched clone is returned and the cache is left
   * untouched. An entity that is not cached is built, and stored unless `cache` is `false`.
   *
   * @param data The raw data.
   * @param cache Whether to write to the cache.
   * @param options The cache key, when it cannot be derived from the data, and the extras of `createStructure`.
   * @internal
   */
  public async _add(
    data: CacheEntityTypes[Name],
    cache = true,
    { id = this.keyOf(data), extras = [] }: AddOptions = {},
  ): Promise<Value> {
    const existing = await this.cache.get(id);
    if (existing) {
      if (!cache) return existing[kClone](data as never);
      existing[kPatch](data as never);
      await this.cache.set(id, existing);
      return existing;
    }

    const entry = await this._build(data, extras);
    if (cache) await this.cache.set(id, entry);
    return entry;
  }

  /**
   * Gets the cached structure of the entity raw data describes, or builds one from the data when it is not cached.
   * Used to resolve the relations of other structures, e.g. a message's author. Synchronous when the cache is.
   *
   * @param data The raw data.
   * @internal
   */
  public _resolveData(data: CacheEntityTypes[Name]): Awaitable<Value> {
    return whenAll([this.cache.get(this.keyOf(data))], ([cached]) => cached ?? this._build(data));
  }

  /**
   * Gets a guild from the cache, to resolve the `guild` of a structure. Synchronous when the guild cache is.
   *
   * @param guildId The ID of the guild, if the structure belongs to one.
   * @returns The guild, or `null` when there is no ID or the guild is not cached.
   */
  protected cachedGuild(guildId: string | null | undefined): Awaitable<Guild | null> {
    return guildId
      ? whenAll([this.client.guilds._getShallow(guildId)], ([guild]) => guild ?? null)
      : null;
  }

  /**
   * Builds the structure of raw data, resolving its relations from the cache; synchronous when every cache the
   * relations are read from is. Without relations to resolve, the same as `createStructure`.
   *
   * @param data The raw data.
   * @param extras The extra arguments passed to {@link CachedManager._add}.
   * @internal
   */
  public _hydrate(data: CacheEntityTypes[Name], ...extras: unknown[]): Awaitable<Value> {
    return this.createStructure(data, ...extras);
  }

  /**
   * Builds the structure of raw data with {@link CachedManager._hydrate}, bound to this manager's client.
   *
   * @param data The raw data.
   * @param extras The extra arguments passed to {@link CachedManager._add}.
   * @internal
   */
  public _build(data: CacheEntityTypes[Name], extras: unknown[] = []): Awaitable<Value> {
    return whenAll([this._hydrate(data, ...extras)], ([value]) => bindClient(value, this.client));
  }

  /**
   * Gets an entity from the cache, fetching it from the API (and caching it) on a cache miss.
   *
   * @example
   * ```typescript
   * await client.users.fetch(userId); // cache first
   * await client.users.fetch(userId, { force: true }); // always the API
   * await client.users.fetch(userId, { force: true, cache: false }); // the API, without storing the result
   * ```
   *
   * @param args The arguments identifying the entity, optionally followed by {@link FetchOptions}.
   */
  public async fetch(...args: [...Args] | [...Args, FetchOptions]): Promise<Value> {
    const ids = args.slice(0, this.resolveKey.length) as unknown as Args;
    const { force = false, cache = true } = (args[this.resolveKey.length] ?? {}) as FetchOptions;
    const id = this.resolveKey(...ids);

    if (!force) {
      const cached = await this.cache.get(id);
      if (cached) return cached;
    }

    const raw = await this.fetchRaw(...ids);
    return this._add(raw, cache, { id });
  }

  /**
   * Fetches an entity from the API, bypassing and then updating the cache. Same as `fetch(...args, { force: true })`.
   *
   * @param args The arguments identifying the entity.
   */
  public refresh(...args: Args): Promise<Value> {
    return this.fetch(...args, { force: true });
  }

  /**
   * Gets the cache key of raw data.
   *
   * @param data The raw data.
   */
  public abstract keyOf(data: CacheEntityTypes[Name]): string;

  /**
   * Fetches the raw data of an entity from the API.
   *
   * @param args The arguments identifying the entity.
   */
  protected abstract fetchRaw(...args: Args): Promise<CacheEntityTypes[Name]>;

  /**
   * Gets this entity's raw store when it can enumerate its entries, for the `listCached` methods.
   *
   * @returns The store, or `undefined` when this entity is not cached.
   * @throws {TypeError} When the store cannot enumerate its entries.
   */
  protected iterableCache(): IterableEntityCache<CacheEntityTypes[Name]> | undefined {
    const { store } = this;
    if (store === undefined) return undefined;
    if (!isIterableCache(store)) {
      throw new GatewayTypeError("CacheNotIterable", this.name);
    }

    return store;
  }

  /**
   * Runs a raw store operation, reporting its failure through `cacheError`. With the client's `cacheErrors: "miss"`,
   * a failure resolves to `fallback`, otherwise it is rethrown. Synchronous when the operation is.
   */
  protected guard<T>(
    operation: CacheErrorContext["operation"],
    key: string | null,
    run: () => Awaitable<T>,
    fallback: T,
  ): Awaitable<T> {
    return this.client.guardCache(this.name, operation, key, run, fallback);
  }
}
````

Removed on purpose: `entity`, the raw `cache` getter, `get`, `cached`, `_get`, `resolve` (now on `DataManager`), `resolveData`, `hydrate`, `construct`, the public `createStructure`, `getByKey`, `storeRaw`, `build`, and the `BaseManager` alias export at the bottom of the file.

- [ ] **Step 6: Client wiring**

In `packages/plugin-gateway/src/GatewayClient.ts`:

1. Options: change `cache?: Cache` to `cache?: Cache | null` and add, with JSDoc in the file's style (document the default, `cache: null`, and the conflict):

```ts
  cacheConstructor?: CacheConstructor;
```

Rename the plugin-cache import alias if needed so the two `Cache` types do not collide in this file: `import type { Cache as EntityCaches } from "@wolfstar/plugin-cache"` and `import type { Cache, CacheConstructor, StructureCreator } from "./util/cache.js"`.

2. Fields and methods (the public method keeps the reference's name; the private field holds the constructor):

```ts
  // One cache per entity, shared by every manager of that entity.
  readonly #caches = new Map<CacheEntityName, Cache<any>>();

  // `null` when the managers view plugin-cache stores (or nothing) instead of caches built by a constructor.
  readonly #cacheConstructor: CacheConstructor | null;

  /**
   * Gets the cache of an entity, building it on first use: the `CacheConstructor` of the discord.js RFC #11426.
   * Every manager of the same entity shares the same cache.
   *
   * @param creator Builds a structure from raw data, for entities the client does not know how to build.
   * @param name The name of the entity.
   */
  public CacheConstructor<Value extends StructureMixin<object>>(
    creator: StructureCreator<Value>,
    name: CacheEntityName,
  ): Cache<Value> {
    let cache = this.#caches.get(name);
    if (cache === undefined) {
      cache = this.#createCache(creator, name);
      this.#caches.set(name, cache);
    }

    return cache as Cache<Value>;
  }

  /**
   * Runs a raw store operation, reporting its failure through `cacheError`, see `cacheErrors`.
   *
   * @internal
   */
  public guardCache<T>(
    entity: CacheEntityName,
    operation: CacheErrorContext["operation"],
    key: string | null,
    run: () => Awaitable<T>,
    fallback: T,
  ): Awaitable<T> {
    const fail = (error: unknown): T => {
      this.emit("cacheError", error, { entity, key, operation });
      if (this.cacheErrors === "throw") throw error;
      return fallback;
    };

    try {
      const result = run();
      return isPromiseLike(result) ? result.catch(fail) : result;
    } catch (error) {
      return fail(error);
    }
  }

  #createCache(creator: StructureCreator<any>, name: CacheEntityName): Cache<any> {
    const managed = (ManagedEntityNames as readonly string[]).includes(name);
    // Managed entities are built by their manager, relations included, whoever asked for the cache first.
    const hydrate = managed
      ? (data: object) => managerOf(this, name as ManagedEntityName, data)._build(data as never)
      : (data: object) => creator(data);
    const keyOf = managed
      ? (data: object) => managerOf(this, name as ManagedEntityName, data).keyOf(data as never)
      : (data: object) => (data as { id: string }).id;
    const create = (data: object) => {
      const value = hydrate(data);
      if (isPromiseLike(value)) {
        value.catch(() => undefined);
        throw new GatewayTypeError("CacheConstructorAsynchronous", name);
      }

      return value;
    };

    if (this.#cacheConstructor) {
      // Re-resolves the relations of a long-lived instance, see the spec's "Consequences of instance identity".
      const refresh = (value: StructureMixin<object>) => {
        const fresh = create((value as unknown as { toJSON(): object }).toJSON());
        value[kRelations] = fresh[kRelations];
        return value;
      };
      return new this.#cacheConstructor(create, name, { keyOf, refresh });
    }

    const store = this.#stores?.[name] as EntityCache<any> | undefined;
    if (store === undefined) return new NullCache(create, name);
    return new EntityStoreCache(create, name, {
      store,
      keyOf,
      hydrate,
      guard: (operation, key, run, fallback) => this.guardCache(name, operation, key, run, fallback),
    });
  }
```

`NullCache`'s creator may be reached with asynchronous relations only if another entity is backed by an asynchronous store; in that branch pass `hydrate` through instead of throwing: construct `NullCache` with `(data) => creator(data)` when `this.#stores` contains any store whose `synchronous !== true`.

3. Constructor, replacing `this.cache = resolveCache(options);` and running **before** the managers are constructed:

```ts
const stores = resolveCache(options);
if (options.cacheConstructor && stores) throw new GatewayTypeError("ClientCacheConflict");
this.#stores = stores;
this.#cacheConstructor =
  options.cache === null || stores ? null : (options.cacheConstructor ?? CollectionCache);
```

(`readonly #stores: EntityCaches | undefined;`), then the managers as today, then, after the managers:

```ts
this.cache = this.#cacheConstructor ? this.#createStructureStores(options.policies) : stores;
```

with

```ts
  // The raw view of the structure caches, which dispatches are written into.
  #createStructureStores(policies: CachePolicies | undefined): EntityCaches {
    return createCache({
      policies,
      makeCache: (name) =>
        (ManagedEntityNames as readonly string[]).includes(name)
          ? createStructureStoreAdapter(this.CacheConstructor(() => undefined as never, name))
          : new MemoryEntityCache(),
    });
  }
```

`this.cache` must be assignable after the managers exist: if it is declared `public readonly cache`, keep it `readonly` and assign once at that point. `resolveCache` at the bottom of the file treats `cache: null` as "no source" (`cache ? … : undefined` already does); keep `policies` wrapping there for the store mode.

4. In `packages/plugin-gateway/src/errors/Messages.ts`: remove `CacheRelationsAsynchronous`; reword `CacheAsynchronous` to `` `The ${entity} cache is asynchronous, await cache.get instead` ``; add

```ts
  ClientCacheConflict: "cacheConstructor cannot be combined with cache or makeCache, pass one or the other",
  CacheConstructorAsynchronous: (entity: string) =>
    `The ${entity} structures resolve relations from an asynchronous cache, which a cache of instances cannot await`,
```

- [ ] **Step 7: Migrate subclasses and call sites**

**Subclasses of `CachedManager`** (17 + `ChannelManager`):

1. `public construct(data)` → `protected createStructure(data)`.
2. Inside the class: `this.construct(` → `this.createStructure(`; `this.hydrate(` → `this._build(`; `this.getByKey(key)` → `this.cache.get(key)`; `this.entity` → `this.name`; `_add(raw, cache, { key })` → `_add(raw, cache, { id: key })`.
3. Raw store access: `this.cache?.x(...)` / `this.cache!.x(...)` on **raw** data → `this.store?.x(...)`, wrapped in `this.guard("<op>", key, () => …, <fallback>)` (spec: guard coverage). Where the code only deletes an entry after a REST call (`await this.cache?.delete(this.resolveKey(...))`), use the structure cache instead: `await this.cache.delete(this.resolveKey(...))`.
4. Read-modify-write helpers on raw data (`GuildMemberManager.updateCachedRoles`, the message patch near `MessageManager.ts:477`) become cache operations that preserve identity:

```ts
const key = this.resolveKey(guildId, userId);
const cached = await this.cache.get(key);
if (cached) {
  cached[kPatch]({ roles: update(cached.roleIds) } as never);
  await this.cache.set(key, cached);
}
```

5. `GuildManager._getShallow`:

```ts
  public _getShallow(guildId: string): Awaitable<Guild | undefined> {
    return whenAll([this.store?.get(guildId)], ([raw]) =>
      raw === undefined ? undefined : bindClient(this.createStructure(raw), this.client),
    );
  }
```

6. `ChannelManager`: remove the `_get` override and `storeRaw`; keep the `_add` override routing threads to `client.threads`; raw reads in `_hydrateInGuild` / `_getInGuild` use `this.store?.get(...)`. Override `createCache`:

```ts
  // A thread ID resolves like any other channel ID: threads live in their own cache, behind `client.threads`.
  protected override createCache(): Cache<AnyChannel> {
    return new ChannelCache(super.createCache(), () => this.client.threads.cache as Cache<AnyChannel>);
  }
```

and add above the class:

```ts
/**
 * The cache of {@link ChannelManager}: the channel cache, falling back to the thread cache.
 */
class ChannelCache implements Cache<AnyChannel> {
  readonly #channels: Cache<AnyChannel>;

  // A function: `client.threads` is constructed after `client.channels`.
  readonly #threads: () => Cache<AnyChannel>;

  public constructor(channels: Cache<AnyChannel>, threads: () => Cache<AnyChannel>) {
    this.#channels = channels;
    this.#threads = threads;
  }

  public get synchronous(): boolean {
    return this.#channels.synchronous && this.#threads().synchronous;
  }

  public get construct() {
    return this.#channels.construct;
  }

  public add(data: Partial<CacheEntityTypes["channels"]>, overwrite = false) {
    return data.type !== undefined && isThreadChannelType(data.type)
      ? this.#threads().add(data as never, overwrite)
      : this.#channels.add(data as never, overwrite);
  }

  public set(key: string, value: AnyChannel): Awaitable<this> {
    const target = isThreadChannelType(value.type) ? this.#threads() : this.#channels;
    return whenAll([target.set(key, value)], () => this);
  }

  public get(key: string): Awaitable<AnyChannel | undefined> {
    return whenAll([this.#channels.get(key)], ([channel]) => channel ?? this.#threads().get(key));
  }

  public has(key: string): Awaitable<boolean> {
    return whenAll([this.#channels.has(key)], ([has]) => has || this.#threads().has(key));
  }

  public delete(key: string): Awaitable<boolean> {
    return whenAll(
      [this.#channels.delete(key)],
      ([deleted]) => deleted || this.#threads().delete(key),
    );
  }

  public getSize(): Awaitable<number> {
    return whenAll([this.#channels.getSize(), this.#threads().getSize()], ([a, b]) => a + b);
  }

  public clear(): Awaitable<void> {
    return whenAll([this.#channels.clear(), this.#threads().clear()], () => undefined);
  }
}
```

**Contextual managers** (`ChannelMessageManager`, `ChannelThreadManager`, `GuildChannelManager`, `GuildEmojiRoleManager`, `GuildMemberRoleManager`, `GuildTemplateManager`, `PermissionOverwriteManager`, `ReactionManager`, `ReactionUserManager`, `ThreadChannelMemberManager`, `WebhookManager`): add `extends BaseManager`, call `super(client)` in the constructor, and drop their own `public readonly client` field.

**Everything else under `src/`:**

| Before                                                           | After                                                                                                                                                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `manager.get(id)` / `manager._get(id)`                           | `manager.cache.get(id)`                                                                                                                                                                          |
| `manager.get(a, b)` / `manager._get(a, b)`                       | `manager.cache.get(manager.resolveKey(a, b))`                                                                                                                                                    |
| `manager.cached(...)`                                            | `manager.cache.get(...)`; if the caller must stay synchronous, throw `GatewayTypeError("CacheAsynchronous", "<entity>")` when the result `isPromiseLike` (after `.catch(() => undefined)` on it) |
| `manager.cache?.x(...)` on raw data, outside the manager's class | `client.cache?.<name>?.x(...)`                                                                                                                                                                   |
| `manager.construct(raw)` / `manager.createStructure(raw)`        | `manager.cache.construct(raw)`                                                                                                                                                                   |
| `manager.hydrate(raw)`                                           | `manager._build(raw)`                                                                                                                                                                            |
| `manager.resolveData(raw)`                                       | `manager._resolveData(raw)`                                                                                                                                                                      |
| `manager.resolve(x)` where the result was awaited                | unchanged (`await` accepts the `Awaitable`)                                                                                                                                                      |

**`src/util/dispatch.ts` — previous state.** Add at the top of the file:

```ts
// The state of an entity before its dispatch is written. A cache of instances patches that very instance, so the
// previous state is a copy of it, like discord.js's `_update`.
async function previous<Value extends { [kClone](): Value }>(
  value: Awaitable<Value | undefined>,
): Promise<Value | undefined> {
  return (await value)?.[kClone]();
}
```

and wrap every `before` read with it (about 30 handlers, `grep -n "before" packages/plugin-gateway/src/util/dispatch.ts`):

```ts
    // before
    before: (client, data) => client.guilds.get(data.id),
    before: (client, data) => client.members.get(data.guild_id, data.user.id),
    // after
    before: (client, data) => previous(client.guilds.cache.get(data.id)),
    before: (client, data) => previous(client.members.cache.get(client.members.resolveKey(data.guild_id, data.user.id))),
```

`before` handlers returning lists (`listCached()` results, the emoji/sticker diffs near lines 654 and 677) map each element through `[kClone]()`. Handlers whose `before` returns something other than a structure (IDs, raw data) stay as they are. Do it handler by handler; `Map#get` and `client.cache?.x?.get` calls in this file must not change.

Verify:

```bash
grep -rnE "\.cached\(|\._get\(|\.resolveData\(|\.entity\b|public construct\(|this\.cache[?!]\." packages/plugin-gateway/src
pnpm typecheck
```

Expected: the grep prints nothing; `pnpm typecheck` passes (fix `packages/plugin-gateway/tests/types/*.ts` with the same table if they use the old API).

- [ ] **Step 8: Run the manager suites**

Run: `pnpm vitest run packages/plugin-gateway/tests/client-cache.test.ts packages/plugin-gateway/tests/cached-manager.test.ts packages/plugin-gateway/tests/zero-cache.test.ts packages/plugin-gateway/tests/collection-cache.test.ts packages/plugin-gateway/tests/entity-store-cache.test.ts packages/plugin-gateway/tests/structure-store-adapter.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/plugin-gateway/src packages/plugin-gateway/tests/client-cache.test.ts packages/plugin-gateway/tests/cached-manager.test.ts packages/plugin-gateway/tests/zero-cache.test.ts packages/plugin-gateway/tests/types
git commit -m "feat(plugin-gateway)!: managers read through cache.<method> built by a cacheConstructor"
```

---

### Task 5: Migrate the remaining suites and cover the cache modes

**Files:**

- Modify: `packages/plugin-gateway/tests/fixtures/cacheModes.ts`, `packages/plugin-gateway/tests/cache-modes.test.ts`
- Modify: every other `packages/plugin-gateway/tests/*.test.ts` still on the old API (`cache-control`, `channels`, `GatewayClient`, `guild-assets`, `guild-events`, `guild-extras`, `hardening`, `member-requests`, `messages`, `moderation`, `reactions`, `relations-channels`, `relations-guilds`, `relations-messages`, `serializers`, `stores`, `threads`, `users-members-roles`, `util`, `voice-presence`, `webhooks`, `errors`, `gateway-events`, `events`, `client-ready`)
- Check: `packages/plugin-sharder/src/ShardManagerProxy.ts`, `packages/plugin-broker/src/lib/redis.ts`, and both packages' tests, for `new GatewayClient(` without a cache that relied on nothing being cached.

**Interfaces:**

- Consumes: Task 4's API.
- Produces: a green `pnpm test`.

- [ ] **Step 1: Cache modes**

Replace `packages/plugin-gateway/tests/fixtures/cacheModes.ts`:

```ts
import { createInMemoryCache, type Cache } from "@wolfstar/plugin-cache";
import type { GatewayClientOptions } from "../../src/index.js";

/**
 * The cache configurations every caching guarantee is checked against: no cache at all, a partial raw cache (users
 * and guilds only), a full raw in-memory cache, and the default cache of structure instances.
 */
export const cacheModes = {
  none: (): Pick<GatewayClientOptions, "cache"> => ({ cache: null }),
  partial: (): Pick<GatewayClientOptions, "cache"> => ({
    cache: createInMemoryCache({ entities: ["users", "guilds"] }) as Cache,
  }),
  full: (): Pick<GatewayClientOptions, "cache"> => ({ cache: createInMemoryCache() }),
  collection: (): Pick<GatewayClientOptions, "cache"> => ({}),
} as const;

export type CacheMode = keyof typeof cacheModes;
```

In `packages/plugin-gateway/tests/cache-modes.test.ts`, the client factory spreads the mode (`...cacheModes[mode]()` instead of `cache: cacheModes[mode]()`); assertions that branch on the mode treat `collection` like `full`.

- [ ] **Step 2: Add the regression tests from Review Focus**

In `packages/plugin-gateway/tests/voice-presence.test.ts`, with the file's own client factory, dispatch helper, and member / voice state fixtures (default cache, i.e. no `cache` option):

```ts
test("GIVEN a cached member THEN its voice relation follows VOICE_STATE_UPDATE on the same instance", async () => {
  const client = createClient();
  await seedGuild(client);
  const key = client.members.resolveKey(guildId, userId);
  const member = await client.members.cache.get(key);
  expect(member?.voice ?? null).toBeNull();

  await dispatch(
    client,
    GatewayDispatchEvents.VoiceStateUpdate,
    voiceState({ channel_id: channelId }),
  );

  const again = await client.members.cache.get(key);
  expect(again).toBe(member);
  expect(again?.voice?.channelId).toBe(channelId);
});
```

Rename `seedGuild`, `voiceState`, `voice`, and the IDs to that file's helpers and getters.

In `packages/plugin-gateway/tests/threads.test.ts`:

```ts
test("GIVEN a thread only in the thread cache THEN channels.cache resolves it", async () => {
  const client = createClient();
  await client.threads._add(thread);

  expect(await client.channels.cache.has(thread.id)).toBe(true);
  expect((await client.channels.cache.get(thread.id))?.id).toBe(thread.id);
  expect(await client.channels.cache.delete(thread.id)).toBe(true);
  expect(await client.threads.cache.get(thread.id)).toBeUndefined();
});
```

In `packages/plugin-gateway/tests/guild-events.test.ts` (or the suite that already tests `GUILD_DELETE`), with the default cache:

```ts
test("GIVEN GUILD_DELETE under the default cache THEN the guild's entities leave the manager caches", async () => {
  const client = createClient();
  await dispatch(client, GatewayDispatchEvents.GuildCreate, guildCreate);
  expect(await client.guilds.cache.has(guildId)).toBe(true);

  await dispatch(client, GatewayDispatchEvents.GuildDelete, { id: guildId });

  expect(await client.guilds.cache.has(guildId)).toBe(false);
  expect(await client.channels.cache.getSize()).toBe(0);
  expect(await client.roles.cache.getSize()).toBe(0);
});
```

using that file's `GUILD_CREATE` fixture (it must contain at least one channel and one role).

- [ ] **Step 3: Apply the migration table**

Same table as Task 4 Step 7. Frequent shapes in tests:

```ts
// before
await client.members.get(guildId, userId);
await client.guilds.emojis(guildId).get("42");
client.users.cached(userId);
// after
await client.members.cache.get(client.members.resolveKey(guildId, userId));
await client.guilds.emojis(guildId).cache.get(client.guilds.emojis(guildId).resolveKey("42"));
client.users.cache.get(userId);
```

- A client created without `cache` used to cache nothing. Decide per test: if it asserts REST fallbacks or `null` previous states, pass `cache: null`; otherwise leave the new default.
- Raw seeding through `client.cache!.roles.set(...)` keeps working (it goes through the adapter). Under the default cache, `client.cache!.<name>` is never `undefined` for managed entities.
- Assertions comparing two reads with `toEqual` keep passing; those asserting two reads are **different** objects only hold with a raw cache (`cache: createInMemoryCache()`).
- Tests asserting that `cached()` throws on an asynchronous cache become assertions that `cache.synchronous` is `false` and `cache.get(...)` returns a `Promise`.

- [ ] **Step 4: Run the whole suite**

Run: `pnpm test`
Expected: PASS for every package. Then:

```bash
grep -rnE "\.cached\(|\.construct\(" packages/plugin-gateway/tests | grep -v "cache\.construct("
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add packages
git commit -m "test(plugin-gateway): migrate suites to cache.<method> and cover the default cache"
```

---

### Task 6: README, changeset, full verification

**Files:**

- Modify: `packages/plugin-gateway/README.md`
- Create: `.changeset/cache-core.md`

**Interfaces:**

- Consumes: everything above.
- Produces: the release note and green `lint` / `build` / `typecheck` / `test`.

- [ ] **Step 1: Update the README**

Find stale examples:

```bash
grep -nE "\.cached\(|\.(users|guilds|channels|roles|members|messages|threads)\.get\(|BaseManager|makeCache|createInMemoryCache|cache:" packages/plugin-gateway/README.md
```

Rewrite each hit with the migration table, and replace the section introducing the cache with:

````markdown
### Cache

Every manager exposes its cache as `manager.cache`, the `Cache` of the discord.js RFC:

```typescript
const user = client.users.cache.get(userId);
const member = client.members.cache.get(client.members.resolveKey(guildId, userId));

client.users.cache.has(userId);
client.users.cache.getSize();
```

By default, entities are kept in memory by `CollectionCache`, a `Collection` of structure instances: updates patch
the cached instance in place, as in discord.js, and every method is synchronous.

```typescript
import { createRedisCache } from "@wolfstar/plugin-cache";

new GatewayClient({ intents }); // CollectionCache, in memory
new GatewayClient({ intents, cache: createRedisCache(redis) }); // raw data in Redis
new GatewayClient({ intents, cache: null }); // nothing is cached
new GatewayClient({ intents, cacheConstructor: MyCache }); // your own Cache implementation
```

With a `@wolfstar/plugin-cache` store, the cache holds raw API data and builds a structure on every read: the methods
return promises when the store is remote (`await` works with every cache, `manager.cache.synchronous` tells them
apart), and two reads return two objects. `policies` apply to every mode; their `ttl` only to plugin-cache stores.

`manager.fetch(...)` reads the cache first and falls back to the REST API.
````

- [ ] **Step 2: Write the changeset**

Create `.changeset/cache-core.md`:

```markdown
---
"@wolfstar/plugin-gateway": minor
---

**Breaking:** managers now expose the discord.js RFC `Cache` as `manager.cache`, built by a client-level `cacheConstructor`.

- **New default.** Without a cache option, every entity is cached in memory by `CollectionCache`, a `Collection` of structure instances that updates patch in place. Pass `cache: null` to cache nothing (the previous default).
- `manager.cache` is always defined: `get`, `set`, `has`, `delete`, `add`, `clear`, `getSize`, `construct`, and `synchronous`. `CollectionCache`, `EntityStoreCache`, `NullCache`, and the `Cache` / `CacheConstructor` types are exported.
- `cache` / `makeCache` (`@wolfstar/plugin-cache`) keep working: managers view the raw stores through `EntityStoreCache`. `cacheConstructor` cannot be combined with them.
- Managers follow `BaseManager → DataManager → CachedManager`. `BaseManager` is now the root class, no longer an alias of `CachedManager`. `DataManager` adds `resolveId`.
- Removed `manager.get()`, `manager.cached()`, `manager.construct()`, `manager.hydrate()`, `manager.resolveData()`, and `manager.entity`. `createStructure` is the protected structure creator; `_add`'s options are `{ id, extras }`.
- `_add` returns the cached instance, patched, or a clone with `cache: false`.

| Before                                      | After                                                                  |
| ------------------------------------------- | ---------------------------------------------------------------------- |
| `client.users.get(id)`                      | `client.users.cache.get(id)`                                           |
| `client.members.get(guildId, userId)`       | `client.members.cache.get(client.members.resolveKey(guildId, userId))` |
| `client.users.cached(id)`                   | `client.users.cache.get(id)`                                           |
| `client.users.cache?.get(id)` (raw)         | `client.cache?.users?.get(id)`                                         |
| `client.users.construct(raw)`               | `client.users.cache.construct(raw)`                                    |
| `new GatewayClient({ intents })` (no cache) | `new GatewayClient({ intents, cache: null })`                          |
```

- [ ] **Step 3: Full verification**

Run, from the repo root, each to completion:

```bash
pnpm lint
pnpm build
pnpm typecheck
pnpm test
pnpm changeset status --since=origin/main
```

Expected: all exit 0; `changeset status` lists `@wolfstar/plugin-gateway` with a minor bump and no other package.

`CLAUDE.md` needs no update: no command, package, CI, or release-flow change.

- [ ] **Step 4: Commit**

```bash
git add packages/plugin-gateway/README.md .changeset/cache-core.md
git commit -m "docs(plugin-gateway): document manager.cache and the cacheConstructor"
```
