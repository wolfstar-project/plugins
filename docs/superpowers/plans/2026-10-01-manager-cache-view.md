# Manager cache view (`manager.cache.<method>`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every `plugin-gateway` manager read through `manager.cache.<method>` like the discord.js `next` RFC `CachedManager`, and bring `GuildMemberRoleManager` to discord.js parity.

**Architecture:** `@wolfstar/plugin-cache` keeps storing raw API data. A new `EntityCacheView` implements the RFC's `Cache<Value>` interface on top of a raw store: it hydrates structures on read and serializes them on write. `CachedManager` owns one view as `cache`, exposes `createStructure` / `_add` like the reference, and loses `get` / `cached`. `GuildMemberRoleManager` is rebuilt around the member structure with discord.js's surface.

**Tech Stack:** TypeScript 7, vitest, pnpm/turbo, discord-api-types v10, `@discordjs/structures`, `@discordjs/collection`.

**Spec:** `docs/superpowers/specs/2026-10-01-manager-cache-view-design.md`

**Reference sources** (read before Task 1):

- <https://github.com/Qjuh/discord.js/blob/feat/next-channel-usage/packages/next/src/managers/CachedManager.ts>
- <https://github.com/Qjuh/discord.js/blob/feat/next-channel-usage/packages/next/src/util/cache.ts>
- <https://github.com/discordjs/discord.js/blob/main/packages/discord.js/src/managers/GuildMemberRoleManager.js>

## Global Constraints

- Only `packages/plugin-gateway` changes. `@wolfstar/plugin-cache` is not touched and gets no changeset.
- Clean break: no deprecated aliases for `get`, `cached`, `construct`, `BaseManager`.
- `resolveKey(...args)` and `resolve(value | key)` keep their current signatures and behaviour.
- The cache never stores structures, only raw API data.
- Every `Cache<Value>` method returns `Awaitable` and must stay synchronous when the underlying store is (`synchronous: true`): use `whenAll`, never `async`, inside the view.
- A failing store emits `cacheError` and, under `cacheErrors: "miss"`, behaves as if the entity had no store.
- One `minor` changeset for `@wolfstar/plugin-gateway` (breaking under 0.x, package is at `0.8.0`).
- Comments/JSDoc follow the surrounding style (TSDoc, `@remarks`, `@example`, `@internal`).
- Commit messages follow Conventional Commits (commitlint hook); the pre-commit hook runs oxfmt + `oxlint --fix`.
- Done = `pnpm lint`, `pnpm build`, `pnpm typecheck`, `pnpm test` all green, run from the repo root.

## Review Focus

- `channels.cache.get(threadId)` when the thread lives only in the thread store → resolves the thread, as `channels.get` did.
- `cache.get(key)` on a Redis-backed store used without `await` in a synchronous filter → callers must check `cache.synchronous`; the two in-repo synchronous callers (`.cached(` in `src/`) keep their synchronous guarantee or throw a clear error.
- A throwing store under `cacheErrors: "throw"` on the synchronous path → the error is thrown synchronously, not as an unhandled rejection.
- `member.roles.add(role)` when the member is not in the cache → the REST call still happens and the returned member carries the new role ID.
- `member.roles.cache` when `@everyone` or some roles are not cached → a collection holding only the cached ones, never `undefined` entries.

---

### Task 1: `Cache<Value>` and `EntityCacheView`

**Files:**

- Modify: `packages/plugin-gateway/src/util/cache.ts` (add the `Cache` interface)
- Modify: `packages/plugin-gateway/src/util/events.ts:66` (widen `CacheErrorContext["operation"]`)
- Create: `packages/plugin-gateway/src/util/EntityCacheView.ts`
- Test: `packages/plugin-gateway/tests/entity-cache-view.test.ts`

**Interfaces:**

- Consumes: `EntityCache`, `Awaitable`, `MemoryEntityCache` from `@wolfstar/plugin-cache`; `whenAll`, `RawAPIType`, `StructureCreator` from `src/util/cache.ts`.
- Produces:

```ts
// src/util/cache.ts
export interface Cache<
  Value extends StructureMixin<object>,
  Raw extends RawAPIType<Value> = RawAPIType<Value>,
> {
  readonly synchronous: boolean;
  readonly construct: StructureCreator<Value, Raw>;
  add(data: Partial<Raw>, overwrite?: boolean): Awaitable<Value>;
  get(key: string): Awaitable<Value | undefined>;
  set(key: string, value: Value): Awaitable<this>;
  has(key: string): Awaitable<boolean>;
  delete(key: string): Awaitable<boolean>;
  clear(): Awaitable<void>;
  getSize(): Awaitable<number>;
}

// src/util/EntityCacheView.ts
export interface EntityCacheViewHost<
  Value extends StructureMixin<object>,
  Raw extends RawAPIType<Value>,
> {
  store(): EntityCache<Raw> | undefined;
  hydrate(raw: Raw): Awaitable<Value>;
  construct: StructureCreator<Value, Raw>;
  keyOf(raw: Raw): string;
  guard<T>(
    operation: CacheErrorContext["operation"],
    key: string | null,
    run: () => Awaitable<T>,
    fallback: T,
  ): Awaitable<T>;
}
export class EntityCacheView<Value, Raw> implements Cache<Value, Raw> {
  constructor(host: EntityCacheViewHost<Value, Raw>);
}
```

- [ ] **Step 1: Write the failing test**

Create `packages/plugin-gateway/tests/entity-cache-view.test.ts`:

```ts
import { MemoryEntityCache, type Awaitable, type EntityCache } from "@wolfstar/plugin-cache";
import type { APIUser } from "discord-api-types/v10";
import { describe, expect, test, vi } from "vitest";
import { User } from "../src/index.js";
import { EntityCacheView, type EntityCacheViewHost } from "../src/util/EntityCacheView.js";

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

function createView(store: EntityCache<APIUser> | undefined, mode: "miss" | "throw" = "miss") {
  const errors: unknown[] = [];
  const host: EntityCacheViewHost<User, APIUser> = {
    store: () => store,
    hydrate: (raw) => new User(raw),
    construct: (raw) => new User(raw),
    keyOf: (raw) => raw.id,
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
  };
  return { view: new EntityCacheView(host), errors };
}

describe("EntityCacheView", () => {
  test("GIVEN a synchronous store THEN every method answers without a promise", () => {
    const store = new MemoryEntityCache<APIUser>();
    const { view } = createView(store);

    expect(view.synchronous).toBe(true);
    expect(view.get(user.id)).toBeUndefined();
    expect(view.has(user.id)).toBe(false);

    const added = view.add(user);
    expect(added).toBeInstanceOf(User);
    expect((view.get(user.id) as User).username).toBe("wolf");
    expect(view.has(user.id)).toBe(true);
    expect(view.getSize()).toBe(1);

    expect(view.delete(user.id)).toBe(true);
    expect(view.getSize()).toBe(0);
  });

  test("GIVEN an asynchronous store THEN the methods resolve to the same values", async () => {
    const { view } = createView(asynchronous(new MemoryEntityCache<APIUser>()));

    expect(view.synchronous).toBe(false);
    expect(view.get(user.id)).toBeInstanceOf(Promise);
    expect(await view.add(user)).toBeInstanceOf(User);
    expect((await view.get(user.id))?.username).toBe("wolf");
    expect(await view.has(user.id)).toBe(true);
    expect(await view.getSize()).toBe(1);
    await view.clear();
    expect(await view.getSize()).toBe(0);
  });

  test("GIVEN add THEN the data is merged unless overwrite is set", () => {
    const store = new MemoryEntityCache<APIUser>();
    const { view } = createView(store);
    store.set(user.id, { ...user, banner: "banner" });

    expect((view.add({ id: user.id, username: "howl" }) as User).banner).toBe("banner");
    expect(store.get(user.id)).toMatchObject({ username: "howl", banner: "banner" });

    view.add({ ...user, username: "pup" }, true);
    expect((store.get(user.id) as APIUser).banner).toBeUndefined();
  });

  test("GIVEN set THEN the structure is stored as raw data and the view returned", () => {
    const store = new MemoryEntityCache<APIUser>();
    const { view } = createView(store);

    expect(view.set(user.id, new User(user))).toBe(view);
    expect(store.get(user.id)).toEqual(user);
  });

  test("GIVEN no store THEN the view is empty and add still builds the structure", () => {
    const { view } = createView(undefined);

    expect(view.synchronous).toBe(true);
    expect(view.get(user.id)).toBeUndefined();
    expect(view.has(user.id)).toBe(false);
    expect(view.delete(user.id)).toBe(false);
    expect(view.getSize()).toBe(0);
    expect(view.clear()).toBeUndefined();
    expect(view.set(user.id, new User(user))).toBe(view);
    expect((view.add(user) as User).id).toBe(user.id);
  });

  test("GIVEN construct THEN it builds a structure without touching the store", () => {
    const store = new MemoryEntityCache<APIUser>();
    const get = vi.spyOn(store, "get");
    const { view } = createView(store);

    expect(view.construct(user)).toBeInstanceOf(User);
    expect(get).not.toHaveBeenCalled();
  });

  test("GIVEN a throwing store under miss THEN it behaves like no store", () => {
    const store = new MemoryEntityCache<APIUser>();
    for (const method of ["get", "set", "upsert", "has", "delete", "clear", "getSize"] as const) {
      vi.spyOn(store, method).mockImplementation(() => {
        throw new Error("down");
      });
    }
    const { view, errors } = createView(store);

    expect(view.get(user.id)).toBeUndefined();
    expect(view.has(user.id)).toBe(false);
    expect(view.delete(user.id)).toBe(false);
    expect(view.getSize()).toBe(0);
    expect((view.add(user) as User).id).toBe(user.id);
    expect(view.set(user.id, new User(user))).toBe(view);
    expect(errors).toHaveLength(6);
  });

  test("GIVEN a throwing synchronous store under throw THEN the error is thrown synchronously", () => {
    const store = new MemoryEntityCache<APIUser>();
    vi.spyOn(store, "get").mockImplementation(() => {
      throw new Error("down");
    });
    const { view } = createView(store, "throw");

    expect(() => view.get(user.id)).toThrow("down");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (repo root): `pnpm vitest run packages/plugin-gateway/tests/entity-cache-view.test.ts`
Expected: FAIL, cannot resolve `../src/util/EntityCacheView.js`.

- [ ] **Step 3: Add the `Cache` interface**

Append to `packages/plugin-gateway/src/util/cache.ts`, after `StructureCreator`:

```ts
/**
 * The cache of a manager, as in the discord.js RFC #11426: it hands out {@link StructureMixin | structures}, while the
 * store behind it (`@wolfstar/plugin-cache`) only holds raw API data.
 *
 * @remarks
 * Every method is {@link Awaitable}: synchronous on a synchronous store (`createInMemoryCache`), a promise otherwise
 * (Redis). `await` works with both, and {@link Cache.synchronous} tells them apart for hot paths that cannot await.
 *
 * Without a store for the entity, the cache is empty: `get` answers `undefined`, `getSize` answers `0`, and writes are
 * dropped.
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
   * The function used to construct instances of the structure this cache holds, without resolving its relations.
   */
  readonly construct: StructureCreator<Value, Raw>;

  /**
   * Adds or updates data in the cache, returning the instantiated structure. If the entry exists, the data is merged
   * into it unless `overwrite` is true.
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
```

In `packages/plugin-gateway/src/util/events.ts`, change the `operation` member of `CacheErrorContext`:

```ts
operation: "get" | "set" | "upsert" | "delete" | "has" | "clear" | "getSize";
```

- [ ] **Step 4: Implement `EntityCacheView`**

Create `packages/plugin-gateway/src/util/EntityCacheView.ts`:

```ts
import type { Awaitable, EntityCache } from "@wolfstar/plugin-cache";
import type { StructureMixin } from "../structures/Structure.js";
import { whenAll, type Cache, type RawAPIType, type StructureCreator } from "./cache.js";
import type { CacheErrorContext } from "./events.js";

/**
 * What an {@link EntityCacheView} needs from the manager owning it.
 *
 * @internal
 */
export interface EntityCacheViewHost<
  Value extends StructureMixin<object>,
  Raw extends RawAPIType<Value>,
> {
  /**
   * The raw store, `undefined` when the entity is not cached. Read on every call, so the view follows the client.
   */
  store(): EntityCache<Raw> | undefined;
  /**
   * Builds the structure of raw data, resolving its relations from the cache.
   */
  hydrate(raw: Raw): Awaitable<Value>;
  construct: StructureCreator<Value, Raw>;
  keyOf(raw: Raw): string;
  /**
   * Runs a store operation, reporting its failure through `cacheError`.
   */
  guard<T>(
    operation: CacheErrorContext["operation"],
    key: string | null,
    run: () => Awaitable<T>,
    fallback: T,
  ): Awaitable<T>;
}

/**
 * The {@link Cache} of a manager: a view handing out structures over a raw `@wolfstar/plugin-cache` store.
 *
 * @internal
 */
export class EntityCacheView<
  Value extends StructureMixin<object>,
  Raw extends RawAPIType<Value> = RawAPIType<Value>,
> implements Cache<Value, Raw> {
  protected readonly host: EntityCacheViewHost<Value, Raw>;

  public constructor(host: EntityCacheViewHost<Value, Raw>) {
    this.host = host;
  }

  public get synchronous(): boolean {
    const store = this.host.store();
    return store === undefined || store.synchronous === true;
  }

  public get construct(): StructureCreator<Value, Raw> {
    return this.host.construct;
  }

  public add(data: Partial<Raw>, overwrite = false): Awaitable<Value> {
    const { host } = this;
    const raw = data as Raw;
    const store = host.store();
    if (store === undefined) return host.hydrate(raw);

    const key = host.keyOf(raw);
    return whenAll(
      [host.guard("upsert", key, () => store.upsert(key, data, { overwrite }), { added: raw })],
      ([{ added }]) => host.hydrate(added),
    );
  }

  public clear(): Awaitable<void> {
    const store = this.host.store();
    if (store === undefined) return undefined;
    return this.host.guard("clear", null, () => store.clear(), undefined);
  }

  public delete(key: string): Awaitable<boolean> {
    const store = this.host.store();
    if (store === undefined) return false;
    return this.host.guard("delete", key, () => store.delete(key), false);
  }

  public get(key: string): Awaitable<Value | undefined> {
    const { host } = this;
    const store = host.store();
    if (store === undefined) return undefined;
    return whenAll([host.guard("get", key, () => store.get(key), undefined)], ([raw]) =>
      raw === undefined ? undefined : host.hydrate(raw),
    );
  }

  public getSize(): Awaitable<number> {
    const store = this.host.store();
    if (store === undefined) return 0;
    return this.host.guard("getSize", null, () => store.getSize(), 0);
  }

  public has(key: string): Awaitable<boolean> {
    const store = this.host.store();
    if (store === undefined) return false;
    return this.host.guard("has", key, () => store.has(key), false);
  }

  public set(key: string, value: Value): Awaitable<this> {
    const store = this.host.store();
    if (store === undefined) return this;
    const raw = (value as unknown as { toJSON(): Raw }).toJSON();
    return whenAll([this.host.guard("set", key, () => store.set(key, raw), undefined)], () => this);
  }
}
```

`EntityCacheView` is internal: do **not** export it from `src/index.ts`. The `Cache` type is exported already through `export type * from "./util/cache.js"`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run packages/plugin-gateway/tests/entity-cache-view.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/plugin-gateway/src/util/cache.ts packages/plugin-gateway/src/util/events.ts packages/plugin-gateway/src/util/EntityCacheView.ts packages/plugin-gateway/tests/entity-cache-view.test.ts
git commit -m "feat(plugin-gateway): add the structure-facing Cache view"
```

---

### Task 2: `CachedManager` on the view, and every `src/` call site

This task changes the public API, so the whole of `src/` moves together: it ends with `pnpm typecheck` green and the three manager-level suites passing. The other test suites are migrated in Task 3 and are expected to be red in between.

**Files:**

- Modify: `packages/plugin-gateway/src/managers/CachedManager.ts` (rewrite)
- Modify: `packages/plugin-gateway/src/managers/ChannelManager.ts` (thread-aware view)
- Modify: the 17 other `CachedManager` subclasses in `packages/plugin-gateway/src/managers/` (`AutoModerationRuleManager`, `GuildBanManager`, `GuildEmojiManager`, `GuildIntegrationManager`, `GuildInviteManager`, `GuildManager`, `GuildMemberManager`, `GuildScheduledEventManager`, `GuildSoundboardSoundManager`, `GuildStickerManager`, `MessageManager`, `PresenceManager`, `RoleManager`, `StageInstanceManager`, `ThreadManager`, `ThreadMemberManager`, `UserManager`, `VoiceStateManager`)
- Modify: call sites in `src/GatewayClient.ts`, `src/util/dispatch.ts`, `src/util/auditLogs.ts`, `src/util/Transformers.ts`, `src/util/Util.ts`, `src/structures/**`, and the non-cached managers (`ChannelMessageManager`, `GuildChannelManager`, `GuildMemberRoleManager`, `GuildTemplateManager`, `PermissionOverwriteManager`, `ReactionManager`, `ThreadChannelMemberManager`, `WebhookManager`)
- Modify: `packages/plugin-gateway/src/errors/Messages.ts` (drop two codes)
- Test: `packages/plugin-gateway/tests/cached-manager.test.ts`, `packages/plugin-gateway/tests/zero-cache.test.ts`

**Interfaces:**

- Consumes: `Cache`, `EntityCacheView`, `EntityCacheViewHost` from Task 1.
- Produces (what Tasks 3–5 rely on):

```ts
abstract class CachedManager<
  Name extends CacheEntityName,
  Value extends StructureMixin<object>,
  Args extends readonly string[],
> {
  public readonly client: GatewayClient;
  public readonly cache: Cache<Value, CacheEntityTypes[Name]>;
  protected readonly name: Name;
  protected get store(): EntityCache<CacheEntityTypes[Name]> | undefined; // the raw store
  protected abstract createStructure(data: CacheEntityTypes[Name], ...extras: unknown[]): Value;
  public abstract keyOf(data: CacheEntityTypes[Name]): string;
  public abstract resolveKey(...args: Args): string;
  public _add(data: CacheEntityTypes[Name], cache?: boolean, options?: AddOptions): Promise<Value>;
  public resolve(value: Value | string): Promise<Value | null>;
  public fetch(...args: [...Args] | [...Args, FetchOptions]): Promise<Value>;
  public refresh(...args: Args): Promise<Value>;
  public _hydrate(data: CacheEntityTypes[Name], ...extras: unknown[]): Awaitable<Value>; // @internal
  public _resolveData(data: CacheEntityTypes[Name]): Awaitable<Value>; // @internal
}
interface AddOptions {
  id?: string;
  extras?: unknown[];
}
```

- [ ] **Step 1: Rewrite the manager tests first**

In `packages/plugin-gateway/tests/cached-manager.test.ts`:

1. Remove `BaseManager` from the import list and delete any test asserting `BaseManager === CachedManager`.
2. Apply the migration table of Step 5 to every call in the file.
3. Replace the `describe` block(s) covering `cached()` (they assert `CacheAsynchronous` / `CacheRelationsAsynchronous`) with:

```ts
describe("CachedManager#cache", () => {
  test("GIVEN an in-memory cache THEN cache.get answers synchronously", async () => {
    const client = createClient();
    await client.cache!.users.set(user.id, user);

    expect(client.users.cache.synchronous).toBe(true);
    const cached = client.users.cache.get(user.id);
    expect(cached).toBeInstanceOf(User);
    expect((cached as User).client).toBe(client);
  });

  test("GIVEN a Redis cache THEN cache.get answers with a promise", async () => {
    const client = createClient({ cache: createRedisCache(new FakeRedis() as never) });
    await client.cache!.users.set(user.id, user);

    expect(client.users.cache.synchronous).toBe(false);
    const cached = client.users.cache.get(user.id);
    expect(cached).toBeInstanceOf(Promise);
    expect((await cached)?.username).toBe("wolf");
  });

  test("GIVEN a composite key THEN resolveKey builds what cache.get takes", async () => {
    const client = createClient();
    await client.cache!.roles.set(roleKey(guildId, "5"), {
      id: "5",
      guild_id: guildId,
      name: "mods",
    } as never);

    const role = await client.roles.cache.get(client.roles.resolveKey(guildId, "5"));
    expect(role?.name).toBe("mods");
    expect(await client.roles.resolve(client.roles.resolveKey(guildId, "5"))).not.toBeNull();
    expect(await client.roles.resolve("missing")).toBeNull();
  });

  test("GIVEN cache.set THEN the structure is written as raw data", async () => {
    const client = createClient();

    await client.users.cache.set(user.id, new User(user));

    expect(await client.cache!.users.get(user.id)).toEqual(user);
  });

  test("GIVEN cache.add THEN the entry is patched and the structure returned", async () => {
    const client = createClient();
    await client.cache!.users.set(user.id, { ...user, banner: "banner" });

    const added = await client.users.cache.add({ id: user.id, username: "howl" });

    expect(added.username).toBe("howl");
    expect(added.banner).toBe("banner");
  });

  test("GIVEN a failing store under miss THEN cache.get is a miss and cacheError is emitted", async () => {
    const client = createClient();
    const onError = vi.fn();
    client.on("cacheError", onError);
    vi.spyOn(client.cache!.users, "get").mockImplementation(() => {
      throw new Error("down");
    });

    expect(await client.users.cache.get(user.id)).toBeUndefined();
    expect(onError).toHaveBeenCalledWith(expect.any(Error), {
      entity: "users",
      key: user.id,
      operation: "get",
    });
  });

  test("GIVEN _add with an id THEN the entry is stored under it", async () => {
    const client = createClient();

    await client.users._add(user, true, { id: "custom" });

    expect(await client.cache!.users.get("custom")).toMatchObject({ id: user.id });
  });
});
```

`FakeRedis` and `createRedisCache` are already imported by this file; if the existing Redis tests build the cache differently, reuse their exact construction instead of the line above.

In `packages/plugin-gateway/tests/zero-cache.test.ts`, apply the migration table and add:

```ts
test("GIVEN no cache THEN manager.cache is an empty view", async () => {
  const client = createClient({ cache: undefined });

  expect(client.users.cache.synchronous).toBe(true);
  expect(client.users.cache.get("1")).toBeUndefined();
  expect(client.users.cache.getSize()).toBe(0);
  expect(client.users.cache.has("1")).toBe(false);
});
```

(use the file's own client factory; it already builds clients without a cache.)

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run packages/plugin-gateway/tests/cached-manager.test.ts packages/plugin-gateway/tests/zero-cache.test.ts`
Expected: FAIL, `client.users.cache.get` is not what the tests expect (`cache` is still the raw store / `undefined`).

- [ ] **Step 3: Rewrite `CachedManager`**

Replace the class in `packages/plugin-gateway/src/managers/CachedManager.ts`. Keep `FetchOptions` as is. The complete new file body after the imports:

````ts
import {
  isIterableCache,
  mergeValues,
  type Awaitable,
  type CacheEntityName,
  type CacheEntityTypes,
  type EntityCache,
  type IterableEntityCache,
} from "@wolfstar/plugin-cache";
import type { GatewayClient } from "../GatewayClient.js";
import type { Guild } from "../structures/guilds/Guild.js";
import { bindClient, type StructureMixin } from "../structures/Structure.js";
import { isPromiseLike, whenAll, type Cache } from "../util/cache.js";
import { EntityCacheView, type EntityCacheViewHost } from "../util/EntityCacheView.js";
import type { CacheErrorContext } from "../util/events.js";
import { GatewayTypeError } from "../errors/GatewayError.js";

// FetchOptions: unchanged.

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
 * The base class of every manager, the `CachedManager` of the discord.js RFC #11426: it owns the {@link Cache} of one
 * entity, adds API payloads to it, and falls back to the REST API when asked to.
 *
 * @remarks
 * Reads go through {@link CachedManager.cache}: `client.users.cache.get(id)`. The cache hands out structures, built by
 * `createStructure` with their relations (a message's author, a member's user, ...) resolved from the cache, while the
 * store behind it only ever holds raw API data. Without a store for its entity (see the client's `makeCache`), the
 * cache is empty and `fetch` always hits the API.
 *
 * A failing store (e.g. Redis being unreachable) emits `cacheError` and, with the client's default
 * `cacheErrors: "miss"`, is treated as a cache miss.
 *
 * Caches keyed by more than an ID take the key built by {@link CachedManager.resolveKey}:
 * `client.members.cache.get(client.members.resolveKey(guildId, userId))`.
 *
 * @typeParam Name The name of the entity cache this manager reads from.
 * @typeParam Value The structure this manager builds.
 * @typeParam Args The arguments identifying an entity, e.g. `[id]` or `[guildId, userId]`.
 */
export abstract class CachedManager<
  Name extends CacheEntityName,
  Value extends StructureMixin<object>,
  Args extends readonly string[],
> {
  /**
   * The client this manager belongs to.
   */
  public readonly client: GatewayClient;

  /**
   * The cache of this manager's entity.
   *
   * @example
   * ```typescript
   * const user = await client.users.cache.get(userId);
   * ```
   */
  public readonly cache: Cache<Value, CacheEntityTypes[Name]>;

  /**
   * The name of the entity cache this manager reads from.
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
    this.client = client;
    this.name = name;
    this.cache = this.createCache();
  }

  /**
   * Creates {@link CachedManager.cache}. Managers whose entity spans several stores override it.
   */
  protected createCache(): Cache<Value, CacheEntityTypes[Name]> {
    return new EntityCacheView(this.cacheHost() as never);
  }

  /**
   * What the cache view needs from this manager.
   */
  protected cacheHost(): EntityCacheViewHost<StructureMixin<CacheEntityTypes[Name]>, never> {
    return {
      store: () => this.store,
      hydrate: (raw: CacheEntityTypes[Name]) => this.build(raw),
      construct: (raw: CacheEntityTypes[Name]) =>
        bindClient(this.createStructure(raw), this.client),
      keyOf: (raw: CacheEntityTypes[Name]) => this.keyOf(raw),
      guard: (operation, key, run, fallback) => this.guard(operation, key, run, fallback),
    } as never;
  }

  /**
   * The raw store this manager's cache reads from, or `undefined` when the entity is not cached.
   */
  protected get store(): EntityCache<CacheEntityTypes[Name]> | undefined {
    return this.client.cache?.[this.name] as EntityCache<CacheEntityTypes[Name]> | undefined;
  }

  /**
   * Resolves a structure or a cache key to a structure, like discord.js's `DataManager#resolve`.
   *
   * @param value A structure, returned as is, or the cache key of an entity (its ID, for managers keyed by ID).
   * @returns The structure, or `null` if the key is not cached.
   */
  public async resolve(value: Value | string): Promise<Value | null> {
    if (typeof value !== "string") return value;
    return (await this.cache.get(value)) ?? null;
  }

  /**
   * Adds an API payload to the cache, patching the cached entry with it, and builds its structure. The counterpart of
   * discord.js's `CachedManager#_add`, asynchronous since the cache can be remote.
   *
   * @remarks
   * The payload is shallowly merged into the cached entry, so the fields a partial payload lacks keep their cached
   * value. With `cache` set to `false`, the merged entry is built but not written.
   *
   * The merge is a read followed by a write, not an atomic operation: on a shared cache, a write landing in between
   * (another process, or a dispatch outside the guild's queue) is overwritten.
   *
   * @param data The raw data.
   * @param cache Whether to write the merged entry to the cache.
   * @param options The cache key, when it cannot be derived from the data, and the extras of `createStructure`.
   * @internal
   */
  public async _add(
    data: CacheEntityTypes[Name],
    cache = true,
    { id = this.keyOf(data), extras = [] }: AddOptions = {},
  ): Promise<Value> {
    const { store } = this;
    if (store === undefined) return this.build(data, extras);

    if (!cache) {
      const existing = await this.guard("get", id, () => store.get(id), undefined);
      return this.build(mergeValues(existing, data), extras);
    }

    const { added } = await this.guard("upsert", id, () => store.upsert(id, data), { added: data });
    return this.build(added, extras);
  }

  /**
   * Gets the cached structure of the entity raw data describes, or builds one from the data when it is not cached.
   * Used to resolve the relations of other structures, e.g. a message's author. Synchronous when the cache is.
   *
   * @param data The raw data.
   * @internal
   */
  public _resolveData(data: CacheEntityTypes[Name]): Awaitable<Value> {
    return whenAll([this.cache.get(this.keyOf(data))], ([cached]) => cached ?? this.build(data));
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
   * Gets the cache key of an entity, the one {@link CachedManager.cache} takes.
   *
   * @param args The arguments identifying the entity.
   */
  public abstract resolveKey(...args: Args): string;

  /**
   * Fetches the raw data of an entity from the API.
   *
   * @param args The arguments identifying the entity.
   */
  protected abstract fetchRaw(...args: Args): Promise<CacheEntityTypes[Name]>;

  /**
   * Writes raw data to the store.
   *
   * @param key The cache key of the entity.
   * @param raw The raw data of the entity.
   */
  protected async storeRaw(key: string, raw: CacheEntityTypes[Name]): Promise<void> {
    const { store } = this;
    if (store) await this.guard("set", key, () => store.set(key, raw), undefined);
  }

  /**
   * Gets this manager's store when it can enumerate its entries, for the `listCached` methods.
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
   * Runs a store operation, reporting its failure through `cacheError`. With the client's `cacheErrors: "miss"`, a
   * failure resolves to `fallback`, otherwise it is rethrown. Synchronous when the operation is.
   */
  protected guard<T>(
    operation: CacheErrorContext["operation"],
    key: string | null,
    run: () => Awaitable<T>,
    fallback: T,
  ): Awaitable<T> {
    const fail = (error: unknown): T => {
      this.client.emit("cacheError", error, { entity: this.name, key, operation });
      if (this.client.cacheErrors === "throw") throw error;
      return fallback;
    };

    try {
      const result = run();
      return isPromiseLike(result) ? result.catch(fail) : result;
    } catch (error) {
      return fail(error);
    }
  }

  /**
   * Builds the structure of raw data with {@link CachedManager._hydrate}, bound to this manager's client.
   *
   * @param data The raw data.
   * @param extras The extra arguments passed to {@link CachedManager._add}.
   */
  protected build(data: CacheEntityTypes[Name], extras: unknown[] = []): Awaitable<Value> {
    return whenAll([this._hydrate(data, ...extras)], ([value]) => bindClient(value, this.client));
  }
}
````

Removed on purpose: `entity`, the `cache` getter returning the raw store, `get`, `cached`, `_get`, `resolveData`, `hydrate`, `construct`, the public `createStructure`, `getByKey`, and the `BaseManager` export alias at the bottom of the file. Adjust the `cacheHost()` return type if TypeScript accepts a tighter one than the `never` casts; the runtime shape above is what matters.

In `packages/plugin-gateway/src/errors/Messages.ts`, delete the `CacheAsynchronous` and `CacheRelationsAsynchronous` entries (nothing throws them anymore). If `tests/errors.test.ts` lists them, remove them there in Task 3.

- [ ] **Step 4: Migrate the subclasses**

In every subclass listed under **Files**:

1. Rename `public construct(data)` to `protected createStructure(data)` (same body).
2. Inside the class, replace `this.construct(` with `this.createStructure(`, `this.cache?.` with `this.store?.`, `this.cache!.` with `this.store!.`, `this.hydrate(` with `this.build(`, `this.getByKey(key)` with `this.cache.get(key)`, `this.entity` with `this.name`.
3. Rename the `key` option of `_add` calls to `id`: `this._add(raw, cache, { key })` → `this._add(raw, cache, { id: key })`.
4. `_hydrate` overrides keep their signature (they may ignore `extras`).

Verify nothing is left:

```bash
grep -rnE "public construct\(|this\.construct\(|this\.cache[?!]\.|this\.hydrate\(|getByKey\(|this\.entity\b|\{ key[:, }]" packages/plugin-gateway/src/managers
```

Expected: no output (false positives unrelated to `CachedManager`, e.g. an object literal with a `key` field passed elsewhere, are fine — read each hit).

`GuildManager._getShallow` becomes:

```ts
  public _getShallow(guildId: string): Awaitable<Guild | undefined> {
    return whenAll([this.store?.get(guildId)], ([raw]) =>
      raw === undefined ? undefined : bindClient(this.createStructure(raw), this.client),
    );
  }
```

`ChannelManager` loses its `_get` and `_add` overrides' thread logic to a view. Replace the `_get` override with a `createCache` override, and keep the `_add` and `storeRaw` overrides (they already route threads to `client.threads`):

```ts
  // A thread ID resolves like any other channel ID: threads live in their own store, behind `client.threads`.
  protected override createCache(): Cache<AnyChannel, CacheEntityTypes["channels"]> {
    return new ChannelCacheView(this.cacheHost() as never, () => this.client.threads.cache as never);
  }
```

and add, above the class, in the same file:

```ts
/**
 * The cache of {@link ChannelManager}: the channel store, falling back to the thread store.
 */
class ChannelCacheView extends EntityCacheView<AnyChannel, CacheEntityTypes["channels"]> {
  readonly #threads: () => Cache<AnyChannel, CacheEntityTypes["channels"]>;

  public constructor(
    host: EntityCacheViewHost<AnyChannel, CacheEntityTypes["channels"]>,
    threads: () => Cache<AnyChannel, CacheEntityTypes["channels"]>,
  ) {
    super(host);
    this.#threads = threads;
  }

  public override get synchronous(): boolean {
    return super.synchronous && this.#threads().synchronous;
  }

  public override add(data: Partial<CacheEntityTypes["channels"]>, overwrite = false) {
    return data.type !== undefined && isThreadChannelType(data.type)
      ? this.#threads().add(data, overwrite)
      : super.add(data, overwrite);
  }

  public override set(key: string, value: AnyChannel): Awaitable<this> {
    return isThreadChannelType(value.type)
      ? whenAll([this.#threads().set(key, value)], () => this)
      : super.set(key, value);
  }

  public override get(key: string): Awaitable<AnyChannel | undefined> {
    return whenAll([super.get(key)], ([channel]) => channel ?? this.#threads().get(key));
  }

  public override has(key: string): Awaitable<boolean> {
    return whenAll([super.has(key)], ([has]) => has || this.#threads().has(key));
  }

  public override delete(key: string): Awaitable<boolean> {
    return whenAll([super.delete(key)], ([deleted]) => deleted || this.#threads().delete(key));
  }

  public override getSize(): Awaitable<number> {
    return whenAll(
      [super.getSize(), this.#threads().getSize()],
      ([channels, threads]) => channels + threads,
    );
  }

  public override clear(): Awaitable<void> {
    return whenAll([super.clear(), this.#threads().clear()], () => undefined);
  }
}
```

`#threads` is a function because `client.threads` is constructed after `client.channels`. Import `EntityCacheView`, `EntityCacheViewHost` and `Cache` at the top of the file.

Inside `ChannelManager._hydrateInGuild` and `_getInGuild`, `this.cache?.get(...)` reads **raw** data: after the mechanical rename it must read `this.store?.get(...)`.

- [ ] **Step 5: Migrate the remaining `src/` call sites**

Apply this table to everything under `packages/plugin-gateway/src` outside `CachedManager.ts`:

| Before                                                                                            | After                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `manager.get(id)`                                                                                 | `manager.cache.get(id)`                                                                                                                                      |
| `manager.get(a, b)`                                                                               | `manager.cache.get(manager.resolveKey(a, b))`                                                                                                                |
| `manager._get(id)` / `manager._get(a, b)`                                                         | `manager.cache.get(id)` / `manager.cache.get(manager.resolveKey(a, b))`                                                                                      |
| `manager.cached(...)`                                                                             | see below                                                                                                                                                    |
| `manager.cache?.get/set/delete/upsert/has(...)` on **raw** data (outside the manager's own class) | `client.cache?.<name>?.…`                                                                                                                                    |
| `manager.construct(raw)` / `manager.createStructure(raw)`                                         | `manager.cache.construct(raw)`                                                                                                                               |
| `manager.hydrate(raw)`                                                                            | `manager._hydrate(raw)` (wrap with `bindClient` only if the caller did before) — or `manager._add(raw, false)` when the caller wants the merged cached entry |
| `manager.resolveData(raw)`                                                                        | `manager._resolveData(raw)`                                                                                                                                  |
| `manager.entity`                                                                                  | removed; use the literal entity name                                                                                                                         |

where `manager` is any of `client.users`, `client.guilds`, `client.channels`, `client.threads`, `client.roles`, `client.members`, `client.messages`, `client.presences`, `client.voiceStates`, `client.threadMembers`, and the guild-scoped managers returned by `client.guilds.<x>(guildId)` (`bans`, `emojis`, `stickers`, `invites`, `integrations`, `scheduledEvents`, `soundboardSounds`, `stageInstances`, `autoModerationRules`).

The two synchronous callers of `.cached(` in `src/` (find them with `grep -rn "\.cached(" packages/plugin-gateway/src`) must stay synchronous. Replace each with:

```ts
const value = manager.cache.get(key);
if (isPromiseLike(value)) {
  // Nothing awaits the promise anymore, so its rejection must not go unhandled.
  value.catch(() => undefined);
  throw new GatewayTypeError("CacheAsynchronous", "<entity name>");
}
```

If you take this branch, keep the `CacheAsynchronous` entry in `Messages.ts` with the message `` `The ${entity} cache is asynchronous, await cache.get instead` `` and delete only `CacheRelationsAsynchronous`.

`src/util/dispatch.ts` has the most call sites (~80). Do it handler by handler; do not use a blind regex across the file, since `Map#get` and `client.cache?.x?.get` calls there must not change.

Verify:

```bash
grep -rnE "\.cached\(|\._get\(|\.resolveData\(|BaseManager|\.entity\b" packages/plugin-gateway/src
pnpm typecheck
```

Expected: the grep prints nothing; `pnpm typecheck` fails only inside `packages/plugin-gateway/tests/types/` if a type test still uses the old API — fix those files with the same table until it passes.

- [ ] **Step 6: Run the manager suites**

Run: `pnpm vitest run packages/plugin-gateway/tests/cached-manager.test.ts packages/plugin-gateway/tests/zero-cache.test.ts packages/plugin-gateway/tests/entity-cache-view.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/plugin-gateway/src packages/plugin-gateway/tests/cached-manager.test.ts packages/plugin-gateway/tests/zero-cache.test.ts packages/plugin-gateway/tests/types
git commit -m "feat(plugin-gateway)!: read managers through cache.<method>"
```

---

### Task 3: Migrate the remaining test suites

**Files:**

- Modify: every file under `packages/plugin-gateway/tests/` that still uses the old API. From the current tree: `cache-control`, `channels`, `GatewayClient`, `guild-assets`, `guild-events`, `guild-extras`, `hardening`, `member-requests`, `messages`, `moderation`, `reactions`, `relations-channels`, `relations-guilds`, `relations-messages`, `serializers`, `stores`, `threads`, `users-members-roles`, `util`, `voice-presence`, `webhooks`, `errors` (`*.test.ts`), and `fixtures/cacheModes.ts`.
- Check: `packages/plugin-sharder/src/ShardManagerProxy.ts`, `packages/plugin-broker/src/lib/redis.ts` (they matched a loose grep; confirm they do not call a gateway manager's `get` / `cached`).

**Interfaces:**

- Consumes: the `CachedManager` surface produced by Task 2.
- Produces: a green `pnpm test`.

- [ ] **Step 1: Add the thread-fallback regression test**

In `packages/plugin-gateway/tests/threads.test.ts`, using the file's existing client factory and thread fixture (the raw thread object the file already seeds the cache with), add:

```ts
test("GIVEN a thread only in the thread store THEN channels.cache resolves it", async () => {
  const client = createClient();
  await client.cache!.threads.set(thread.id, thread);

  expect(await client.channels.cache.has(thread.id)).toBe(true);
  expect((await client.channels.cache.get(thread.id))?.id).toBe(thread.id);
  expect(await client.channels.cache.delete(thread.id)).toBe(true);
  expect(await client.cache!.threads.get(thread.id)).toBeUndefined();
});
```

Rename `createClient` / `thread` to the names that file uses.

- [ ] **Step 2: Apply the migration table**

Same table as Task 2 Step 5. In tests, the frequent shapes are:

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

Tests asserting that `cached()` throws on an asynchronous cache become assertions that `cache.synchronous` is `false` and that `cache.get(...)` returns a `Promise`.

Raw-store seeding (`client.cache!.roles.set(...)`, `cache.roles.set(...)`) is **not** a manager call and stays as is.

- [ ] **Step 3: Run the whole suite**

Run: `pnpm test`
Expected: PASS for every package. Then:

```bash
grep -rnE "\.cached\(|BaseManager" packages/plugin-gateway/tests
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add packages/plugin-gateway/tests
git commit -m "test(plugin-gateway): migrate suites to cache.<method>"
```

---

### Task 4: `GuildMemberRoleManager` discord.js parity

**Files:**

- Modify: `packages/plugin-gateway/package.json` (add `@discordjs/collection`)
- Modify: `packages/plugin-gateway/src/managers/GuildMemberRoleManager.ts` (rewrite)
- Modify: `packages/plugin-gateway/src/structures/guilds/GuildMember.ts:130` (`roles` getter)
- Modify: `packages/plugin-gateway/src/managers/GuildMemberManager.ts:38,447` (`GuildMemberEditOptions.roles`, `edit`)
- Modify: `packages/plugin-gateway/src/errors/Messages.ts` (two codes)
- Test: `packages/plugin-gateway/tests/users-members-roles.test.ts`

**Interfaces:**

- Consumes: `client.roles.cache.get`, `client.roles.resolveKey(guildId, roleId)`, `client.members.addRole` / `removeRole` / `edit`, `RoleResolvable` (`src/types.ts:193`), `resolveId` (`src/util/channels.ts`), `kClone`.
- Produces:

```ts
export type RoleCollectionResolvable =
  readonly RoleResolvable[] | ReadonlyCollection<Snowflake, Role>;

export class GuildMemberRoleManager {
  public constructor(member: GuildMember);
  public readonly client: GatewayClient;
  public readonly member: GuildMember;
  public readonly guild: Guild | null;
  public get guildId(): string;
  public get userId(): string;
  public get ids(): readonly string[];
  public get cache(): Awaitable<Collection<Snowflake, Role>>;
  public get highest(): Awaitable<Role | null>;
  public get hoist(): Awaitable<Role | null>;
  public get color(): Awaitable<Role | null>;
  public get icon(): Awaitable<Role | null>;
  public get premiumSubscriberRole(): Awaitable<Role | null>;
  public get botRole(): Awaitable<Role | null>;
  public fetch(): Promise<Role[]>; // unchanged, plus fetchHighest/fetchHoist/fetchColor/fetchIcon/fetchPremiumSubscriberRole/fetchBotRole
  public add(
    roleOrRoles: RoleResolvable | RoleCollectionResolvable,
    reason?: string,
  ): Promise<GuildMember>;
  public remove(
    roleOrRoles: RoleResolvable | RoleCollectionResolvable,
    reason?: string,
  ): Promise<GuildMember>;
  public set(roles: RoleCollectionResolvable, reason?: string): Promise<GuildMember>;
  public clone(): GuildMemberRoleManager;
}
```

- [ ] **Step 1: Add the dependency**

Run (repo root): `pnpm --filter @wolfstar/plugin-gateway add @discordjs/collection@^2.1.1`
Expected: `packages/plugin-gateway/package.json` lists `"@discordjs/collection": "^2.1.1"` under `dependencies`; the lockfile resolves the already-installed `2.1.1`.

- [ ] **Step 2: Write the failing tests**

In `packages/plugin-gateway/tests/users-members-roles.test.ts`, next to the existing `roles.add` / `roles.remove` tests (they use the file's `createClient`, `seedGuild`, `member`, `user`, `guildId`, `userId` helpers; `seedGuild` caches a member holding role `"21"` and roles `"20"` and `"21"` — check the helper and adjust the IDs below if it differs). Add `Collection` from `@discordjs/collection` and `GuildMember`, `Role`, `GatewayErrorCodes` from `../src/index.js` to the imports.

```ts
async function cachedMember(client: GatewayClient): Promise<GuildMember> {
  return (await client.members.cache.get(client.members.resolveKey(guildId, userId)))!;
}

describe("GuildMemberRoleManager discord.js parity", () => {
  test("GIVEN a member THEN the manager exposes member, guild, and a cache collection", async () => {
    const client = createClient();
    await seedGuild(client);
    const structure = await cachedMember(client);

    const { roles } = structure;
    expect(roles.member).toBe(structure);
    expect(roles.guild).toBe(structure.guild);

    const cache = await roles.cache;
    expect(cache).toBeInstanceOf(Collection);
    expect([...cache.keys()]).toEqual(expect.arrayContaining(["21"]));
    expect(cache.every((role) => role instanceof Role)).toBe(true);
  });

  test("GIVEN an in-memory cache THEN cache and highest are synchronous", async () => {
    const client = createClient();
    await seedGuild(client);
    const { roles } = await cachedMember(client);

    expect(roles.cache).toBeInstanceOf(Collection);
    expect(roles.highest).not.toBeInstanceOf(Promise);
    expect((roles.highest as Role | null)?.id).toBe("21");
  });

  test("GIVEN roles that are not cached THEN cache skips them", async () => {
    const client = createClient();
    await seedGuild(client);
    await client.cache!.roles.delete(roleKey(guildId, "21"));
    const { roles } = await cachedMember(client);

    expect((await roles.cache).has("21")).toBe(false);
  });

  test("GIVEN add with a Role structure THEN its ID is used and the updated member returned", async () => {
    const client = createClient();
    await seedGuild(client);
    const put = vi.spyOn(container.rest, "put").mockResolvedValue(undefined);
    const role = (await client.roles.cache.get(client.roles.resolveKey(guildId, "20")))!;

    const updated = await (await cachedMember(client)).roles.add(role, "promo");

    expect(put).toHaveBeenCalledWith(Routes.guildMemberRole(guildId, userId, "20"), {
      reason: "promo",
    });
    expect(updated).toBeInstanceOf(GuildMember);
    expect(updated.roleIds).toEqual(["21", "20"]);
  });

  test("GIVEN add with a Collection THEN the member is patched with the union", async () => {
    const client = createClient();
    await seedGuild(client);
    const patch = vi.spyOn(container.rest, "patch").mockResolvedValue(member(user, ["21", "20"]));
    const role = (await client.roles.cache.get(client.roles.resolveKey(guildId, "20")))!;

    const updated = await (await cachedMember(client)).roles.add(new Collection([[role.id, role]]));

    expect(patch).toHaveBeenCalledWith(Routes.guildMember(guildId, userId), {
      body: expect.objectContaining({ roles: expect.arrayContaining(["21", "20"]) }),
      reason: undefined,
    });
    expect(updated.roleIds).toEqual(["21", "20"]);
  });

  test("GIVEN remove with one role THEN the DELETE route is used and the member returned without it", async () => {
    const client = createClient();
    await seedGuild(client);
    const del = vi.spyOn(container.rest, "delete").mockResolvedValue(undefined);

    const updated = await (await cachedMember(client)).roles.remove("21");

    expect(del).toHaveBeenCalledWith(Routes.guildMemberRole(guildId, userId, "21"), {
      reason: undefined,
    });
    expect(updated.roleIds).toEqual([]);
  });

  test("GIVEN set with Role structures THEN their IDs are sent", async () => {
    const client = createClient();
    await seedGuild(client);
    const patch = vi.spyOn(container.rest, "patch").mockResolvedValue(member(user, ["20"]));
    const role = (await client.roles.cache.get(client.roles.resolveKey(guildId, "20")))!;

    await (await cachedMember(client)).roles.set([role]);

    expect(patch).toHaveBeenCalledWith(Routes.guildMember(guildId, userId), {
      body: expect.objectContaining({ roles: ["20"] }),
      reason: undefined,
    });
  });

  test("GIVEN an uncached member THEN add still calls the API and returns the new role", async () => {
    const client = createClient();
    const put = vi.spyOn(container.rest, "put").mockResolvedValue(undefined);
    const structure = new GuildMember({ ...member(user, []), guild_id: guildId } as never);

    const updated = await structure.roles.add("20");

    expect(put).toHaveBeenCalled();
    expect(updated.roleIds).toEqual(["20"]);
    expect(client.members).toBeDefined();
  });

  test("GIVEN an invalid resolvable THEN a typed error is thrown", async () => {
    const client = createClient();
    await seedGuild(client);
    const { roles } = await cachedMember(client);

    await expect(roles.add(null as never)).rejects.toMatchObject({
      code: GatewayErrorCodes.InvalidType,
    });
    await expect(roles.add([null as never])).rejects.toMatchObject({
      code: GatewayErrorCodes.InvalidElement,
    });
  });

  test("GIVEN clone THEN it manages a copy of the member", async () => {
    const client = createClient();
    await seedGuild(client);
    const structure = await cachedMember(client);

    const clone = structure.roles.clone();

    expect(clone.member).not.toBe(structure);
    expect(clone.ids).toEqual(structure.roles.ids);
  });
});
```

Also update the two existing tests (`GIVEN roles.add with one role…`, `GIVEN roles.remove with several roles…`) only as far as Task 3 already did; their assertions stay valid.

- [ ] **Step 3: Run to verify they fail**

Run: `pnpm vitest run packages/plugin-gateway/tests/users-members-roles.test.ts -t "discord.js parity"`
Expected: FAIL (`roles.member` is undefined, `roles.cache` is undefined, `InvalidType` is not a code).

- [ ] **Step 4: Add the error codes**

In `packages/plugin-gateway/src/errors/Messages.ts`, next to `IdUnresolvable`:

```ts
  InvalidType: (name: string, expected: string, an = false) =>
    `Supplied ${name} is not a${an ? "n" : ""} ${expected}.`,
  InvalidElement: (type: string, name: string, elem: unknown) =>
    `Supplied ${type} ${name} includes an invalid element: ${String(elem)}`,
```

(discord.js's `InvalidType` / `InvalidElement` messages; `GatewayErrorCodes` picks them up automatically.)

- [ ] **Step 5: Rewrite `GuildMemberRoleManager`**

Replace `packages/plugin-gateway/src/managers/GuildMemberRoleManager.ts` with:

````ts
import { Collection, type ReadonlyCollection } from "@discordjs/collection";
import type { Awaitable } from "@wolfstar/plugin-cache";
import type { Snowflake } from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import type { Guild } from "../structures/guilds/Guild.js";
import type { GuildMember } from "../structures/guilds/GuildMember.js";
import type { Role } from "../structures/guilds/Role.js";
import { kClone } from "../structures/Structure.js";
import type { RoleResolvable } from "../types.js";
import { whenAll } from "../util/cache.js";
import { GatewayTypeError } from "../errors/GatewayError.js";

/**
 * Several roles: an array of roles or role IDs, or a collection of roles.
 */
export type RoleCollectionResolvable =
  readonly RoleResolvable[] | ReadonlyCollection<Snowflake, Role>;

const RoleTypes = "Role, Snowflake or Array or Collection of Roles or Snowflakes";

// The ID of a role resolvable, `null` when it is neither a role nor an ID.
function resolveRoleId(role: RoleResolvable): Snowflake | null {
  if (typeof role === "string") return role;
  return typeof role?.id === "string" ? role.id : null;
}

function isSeveral(
  value: RoleResolvable | RoleCollectionResolvable,
): value is RoleCollectionResolvable {
  return Array.isArray(value) || value instanceof Collection;
}

function resolveRoleIds(roles: RoleCollectionResolvable): Snowflake[] {
  const ids: Snowflake[] = [];
  for (const role of roles.values()) {
    const id = resolveRoleId(role);
    if (!id) throw new GatewayTypeError("InvalidElement", "Array or Collection", "roles", role);
    ids.push(id);
  }

  return ids;
}

/**
 * Manages the roles of one {@link GuildMember}, like discord.js's `GuildMemberRoleManager`.
 *
 * @remarks
 * `cache`, `highest`, `hoist`, `color`, `icon`, `premiumSubscriberRole`, and `botRole` read the role cache, so they
 * are {@link Awaitable}: synchronous with an in-memory cache, a promise with Redis. They only see cached roles; the
 * `fetch*` methods fall back to the API.
 */
export class GuildMemberRoleManager {
  /**
   * The client that instantiated this manager.
   */
  public readonly client: GatewayClient;

  /**
   * The member this manager belongs to.
   */
  public readonly member: GuildMember;

  /**
   * The guild this manager belongs to, `null` when it is not cached.
   */
  public readonly guild: Guild | null;

  /**
   * @param member The member.
   */
  public constructor(member: GuildMember) {
    this.client = member.client;
    this.member = member;
    this.guild = member.guild;
  }

  /**
   * The ID of the guild.
   */
  public get guildId(): string {
    return this.member.guildId;
  }

  /**
   * The ID of the member's user.
   */
  public get userId(): string {
    const { id } = this.member;
    if (!id) throw new GatewayTypeError("IdUnresolvable");
    return id;
  }

  /**
   * The IDs of the member's roles, `@everyone` excluded.
   */
  public get ids(): readonly string[] {
    return this.member.roleIds;
  }

  /**
   * The cached roles of this member, `@everyone` included.
   */
  public get cache(): Awaitable<Collection<Snowflake, Role>> {
    const { roles } = this.client;
    const ids = [this.guildId, ...this.ids];
    return whenAll(
      ids.map((id) => roles.cache.get(roles.resolveKey(this.guildId, id))),
      (cached) => {
        const cache = new Collection<Snowflake, Role>();
        for (const role of cached) if (role !== undefined) cache.set(role.id, role);
        return cache;
      },
    );
  }

  /**
   * The role of the member used to hoist them in a separate category in the users list.
   */
  public get hoist(): Awaitable<Role | null> {
    return this.pick((role) => role.hoist);
  }

  /**
   * The role of the member used to set their role icon.
   */
  public get icon(): Awaitable<Role | null> {
    return this.pick((role) => Boolean(role.icon ?? role.unicodeEmoji));
  }

  /**
   * The role of the member used to set their color.
   */
  public get color(): Awaitable<Role | null> {
    return this.pick((role) => Boolean(role.colors.primaryColor));
  }

  /**
   * The role of the member with the highest position, `null` when none of their roles is cached.
   */
  public get highest(): Awaitable<Role | null> {
    return this.pick(() => true);
  }

  /**
   * The premium subscriber role of the guild, if present on the member.
   */
  public get premiumSubscriberRole(): Awaitable<Role | null> {
    return whenAll(
      [this.cache],
      ([cache]) => cache.find((role) => role.tags?.premiumSubscriberRole) ?? null,
    );
  }

  /**
   * The managed role this member created when joining the guild, if any. Only ever available on bots.
   */
  public get botRole(): Awaitable<Role | null> {
    if (!this.member.user?.bot) return null;
    return whenAll(
      [this.cache],
      ([cache]) => cache.find((role) => role.tags?.botId === this.userId) ?? null,
    );
  }

  /**
   * Fetches the member's roles, `@everyone` included, highest first.
   */
  public async fetch(): Promise<Role[]> {
    const ids = [...this.ids, this.guildId];
    const cache = await this.cache;
    let roles = [...cache.values()];
    if (roles.length !== ids.length) {
      // One request for every role of the guild, rather than one per missing role.
      const wanted = new Set(ids);
      roles = (await this.client.roles.fetchAll(this.guildId)).filter((role) =>
        wanted.has(role.id),
      );
    }

    return roles.toSorted((a, b) => b.comparePositionTo(a));
  }

  /**
   * Fetches the member's highest role, `@everyone` when they have no other.
   */
  public async fetchHighest(): Promise<Role | null> {
    return (await this.fetch())[0] ?? null;
  }

  /**
   * Fetches the role the member is displayed under in the member list, if any.
   */
  public async fetchHoist(): Promise<Role | null> {
    return (await this.fetch()).find((role) => role.hoist) ?? null;
  }

  /**
   * Fetches the highest role giving the member a color, if any.
   */
  public async fetchColor(): Promise<Role | null> {
    return (await this.fetch()).find((role) => role.colors.primaryColor) ?? null;
  }

  /**
   * Fetches the highest role giving the member an icon, if any.
   */
  public async fetchIcon(): Promise<Role | null> {
    return (await this.fetch()).find((role) => role.icon ?? role.unicodeEmoji) ?? null;
  }

  /**
   * Fetches the server booster role, if the member has it.
   */
  public async fetchPremiumSubscriberRole(): Promise<Role | null> {
    return (await this.fetch()).find((role) => role.tags?.premiumSubscriberRole) ?? null;
  }

  /**
   * Fetches the role Discord manages for the member, when the member is a bot.
   */
  public async fetchBotRole(): Promise<Role | null> {
    return (await this.fetch()).find((role) => role.tags?.botId === this.userId) ?? null;
  }

  /**
   * Adds a role (or multiple roles) to the member.
   *
   * @remarks
   * Uses the idempotent PUT route for singular roles, otherwise PATCHes the underlying guild member.
   *
   * @param roleOrRoles The role or roles to add.
   * @param reason The reason for the audit log.
   */
  public async add(
    roleOrRoles: RoleResolvable | RoleCollectionResolvable,
    reason?: string,
  ): Promise<GuildMember> {
    if (isSeveral(roleOrRoles)) {
      return this.set([...new Set([...resolveRoleIds(roleOrRoles), ...this.ids])], reason);
    }

    const roleId = resolveRoleId(roleOrRoles);
    if (roleId === null) throw new GatewayTypeError("InvalidType", "roles", RoleTypes);

    await this.client.members.addRole(this.guildId, this.userId, roleId, reason);
    return this.member[kClone]({ roles: [...new Set([...this.ids, roleId])] });
  }

  /**
   * Removes a role (or multiple roles) from the member.
   *
   * @remarks
   * Uses the idempotent DELETE route for singular roles, otherwise PATCHes the underlying guild member.
   *
   * @param roleOrRoles The role or roles to remove.
   * @param reason The reason for the audit log.
   */
  public async remove(
    roleOrRoles: RoleResolvable | RoleCollectionResolvable,
    reason?: string,
  ): Promise<GuildMember> {
    if (isSeveral(roleOrRoles)) {
      const removed = new Set(resolveRoleIds(roleOrRoles));
      return this.set(
        this.ids.filter((id) => !removed.has(id)),
        reason,
      );
    }

    const roleId = resolveRoleId(roleOrRoles);
    if (roleId === null) throw new GatewayTypeError("InvalidType", "roles", RoleTypes);

    await this.client.members.removeRole(this.guildId, this.userId, roleId, reason);
    return this.member[kClone]({ roles: this.ids.filter((id) => id !== roleId) });
  }

  /**
   * Sets the roles applied to the member.
   *
   * @example
   * ```typescript
   * // Remove all the roles from a member
   * await member.roles.set([]);
   * ```
   *
   * @param roles The roles or role IDs to apply.
   * @param reason The reason for the audit log.
   */
  public set(roles: RoleCollectionResolvable, reason?: string): Promise<GuildMember> {
    return this.client.members.edit(this.guildId, this.userId, { roles, reason });
  }

  /**
   * Creates a manager over a copy of the member.
   */
  public clone(): GuildMemberRoleManager {
    return new GuildMemberRoleManager(this.member[kClone]());
  }

  // The highest cached role matching a predicate.
  private pick(predicate: (role: Role) => boolean): Awaitable<Role | null> {
    return whenAll([this.cache], ([cache]) => {
      let picked: Role | null = null;
      for (const role of cache.values()) {
        if (predicate(role) && (picked === null || role.comparePositionTo(picked) > 0))
          picked = role;
      }

      return picked;
    });
  }
}
````

Note `add` with several roles filters `@everyone` out implicitly: `this.ids` never contains the guild ID (discord.js relies on the API ignoring it).

In `packages/plugin-gateway/src/structures/guilds/GuildMember.ts`, the `roles` getter becomes:

```ts
  /**
   * The member's roles, like discord.js's `GuildMember#roles`.
   */
  public get roles(): GuildMemberRoleManager {
    return new GuildMemberRoleManager(this);
  }
```

If `this.requireId()` has no other caller left in the file after this change, leave it: other methods (`edit`, `kick`, …) use it.

In `packages/plugin-gateway/src/managers/GuildMemberManager.ts`:

```ts
// GuildMemberEditOptions
  /**
   * The roles, or their IDs, the member ends up with.
   */
  roles?: RoleCollectionResolvable;
```

and in `edit` (and the other body built from `options.roles` around line 423, which sends `roles` the same way):

```ts
      roles: options.roles ? resolveRoleIds(options.roles) : undefined,
```

Export `resolveRoleIds` from `GuildMemberRoleManager.ts` (`export function resolveRoleIds`) and import it together with the `RoleCollectionResolvable` type. The prune options' `roles?: readonly string[]` (line ~103) are a different field and stay as they are.

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run packages/plugin-gateway/tests/users-members-roles.test.ts`
Expected: PASS, including the pre-existing `roles.add` / `roles.remove` tests.

Run: `pnpm typecheck`
Expected: PASS. `GuildMember#fetchColor` / the permission helpers that call `this.roles.fetch*()` keep compiling since those methods are unchanged.

- [ ] **Step 7: Commit**

```bash
git add packages/plugin-gateway/package.json pnpm-lock.yaml packages/plugin-gateway/src packages/plugin-gateway/tests/users-members-roles.test.ts
git commit -m "feat(plugin-gateway)!: align GuildMemberRoleManager with discord.js"
```

---

### Task 5: README, changeset, full verification

**Files:**

- Modify: `packages/plugin-gateway/README.md`
- Create: `.changeset/manager-cache-view.md`

**Interfaces:**

- Consumes: everything above.
- Produces: the release note and green `lint` / `build` / `typecheck` / `test`.

- [ ] **Step 1: Update the README**

Find every stale example:

```bash
grep -nE "\.cached\(|\.(users|guilds|channels|roles|members|messages|threads)\.get\(|BaseManager|roles\.(add|remove|set|fetch)" packages/plugin-gateway/README.md
```

Rewrite each hit with the Task 2 migration table. In the section describing managers and the cache, replace the `get` / `cached` explanation with:

````markdown
Every manager exposes its cache as `manager.cache`, the `Cache` of the discord.js RFC:

```typescript
const user = await client.users.cache.get(userId);
const member = await client.members.cache.get(client.members.resolveKey(guildId, userId));

await client.users.cache.has(userId);
await client.users.cache.getSize();
```

The methods are synchronous with `createInMemoryCache()` and return promises with Redis; `await` works with both, and
`manager.cache.synchronous` tells them apart. `manager.fetch(...)` still reads the cache first and falls back to the
REST API. The raw store stays available as `client.cache?.users`.
````

and, next to the existing `member.roles.add(roleId, "verified")` example:

````markdown
`member.roles` follows discord.js's `GuildMemberRoleManager`:

```typescript
const roles = await member.roles.cache; // Collection<Snowflake, Role>, @everyone included
const highest = await member.roles.highest;

await member.roles.add(role); // a Role, an ID, an array, or a Collection
await member.roles.remove([roleA, roleB], "cleanup");
await member.roles.set([roleId]);
```
````

- [ ] **Step 2: Write the changeset**

Create `.changeset/manager-cache-view.md`:

```markdown
---
"@wolfstar/plugin-gateway": minor
---

**Breaking:** managers now read through `manager.cache.<method>`, following the discord.js RFC `CachedManager`.

- `manager.cache` is a `Cache<Value>` handing out structures: `get`, `set`, `has`, `delete`, `add`, `clear`, `getSize`, `construct`, and `synchronous`. It is always defined, and empty when the entity has no store. The raw store stays available as `client.cache?.<entity>`.
- Removed `manager.get()`, `manager.cached()`, `manager.construct()`, `manager.hydrate()`, `manager.resolveData()`, `manager.entity`, and the `BaseManager` alias. `createStructure` is now the protected structure creator.
- `_add`'s options are `{ id, extras }` (`id` replaces `key`).
- `GuildMemberRoleManager` matches discord.js: it is built from the member (`member`, `guild`), exposes `cache` (a `Collection`), `highest`, `hoist`, `color`, `icon`, `premiumSubscriberRole`, `botRole`, and `clone()`; `add` / `remove` / `set` accept roles, IDs, arrays, and collections, and always resolve to the updated `GuildMember`. `GuildMemberEditOptions.roles` accepts the same.

| Before                                | After                                                                            |
| ------------------------------------- | -------------------------------------------------------------------------------- |
| `client.users.get(id)`                | `client.users.cache.get(id)`                                                     |
| `client.members.get(guildId, userId)` | `client.members.cache.get(client.members.resolveKey(guildId, userId))`           |
| `client.users.cached(id)`             | `client.users.cache.get(id)` (synchronous when `client.users.cache.synchronous`) |
| `client.users.cache?.get(id)` (raw)   | `client.cache?.users?.get(id)`                                                   |
| `client.users.construct(raw)`         | `client.users.cache.construct(raw)`                                              |
| `await member.roles.fetchHighest()`   | still available, or `await member.roles.highest` (cache only)                    |
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
git add packages/plugin-gateway/README.md .changeset/manager-cache-view.md
git commit -m "docs(plugin-gateway): document cache.<method> and member roles parity"
```
