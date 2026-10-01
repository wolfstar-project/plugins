# Cache core (sub-project A) — design

Date: 2026-10-01
Package: `@wolfstar/plugin-gateway` (breaking; `minor` changeset, as for every breaking change under 0.x)
Supersedes: the "manager cache view" spec and plan of the same day (removed; see git history).

## Context

A comparison of the managers of discord.js and of this package (`confronto-manager-discordjs-wolfstar.md`, 2026-10-01)
found one root difference: discord.js keeps structure **instances** in its caches and patches them in place, while
this package keeps raw API data and rebuilds a structure on every read. From it follow the others: asynchronous reads
(`await client.users.get(id)`), no object identity, a single `CachedManager` class, arrays instead of collections, and
central managers instead of guild- or channel-scoped ones.

The work is split in four sub-projects, each with its own spec, plan, PR and changeset:

| #     | Sub-project        | Content                                                                                                 |
| ----- | ------------------ | ------------------------------------------------------------------------------------------------------- |
| **A** | Cache core         | This spec.                                                                                              |
| B     | Manager API parity | `GuildMemberRoleManager`, `UserManager` (`2026-10-01-manager-api-parity-design.md`, draft).             |
| C     | Collection results | `list`, `fetchAll`, `search`, `listCached`, … return `Collection<Snowflake, Value>`.                    |
| D     | Scoped managers    | `guild.members`, `guild.roles`, `channel.messages`, … with their own `cache` and discord.js signatures. |

## Goal

1. Reads go through `manager.cache.<method>`: `client.users.cache.get(id)`.
2. The cache of a manager is the `Cache<Value>` of the discord.js `next` RFC
   ([`util/cache.ts`](https://github.com/Qjuh/discord.js/blob/feat/next-channel-usage/packages/next/src/util/cache.ts)),
   built by a `cacheConstructor` chosen on the client
   ([`Client.ts`](https://github.com/Qjuh/discord.js/blob/feat/next-channel-usage/packages/next/src/Client.ts)).
3. The default is `CollectionCache`: in memory, synchronous, holding structure instances that `_add` patches in place.
4. `@wolfstar/plugin-cache` stores (Redis, TTL, policies) keep working behind the same interface.
5. Managers follow discord.js's `BaseManager → DataManager → CachedManager` hierarchy, with `CachedManager` shaped like
   the RFC's
   ([`CachedManager.ts`](https://github.com/Qjuh/discord.js/blob/feat/next-channel-usage/packages/next/src/managers/CachedManager.ts)).

## Decisions

| Topic               | Decision                                                                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Compatibility       | Clean break. No deprecated aliases for `get`, `cached`, `construct`.                                                                |
| Default             | No cache option → every entity is cached in memory with `CollectionCache` (today: nothing is cached).                               |
| Raw stores          | `cache` / `makeCache` (plugin-cache) → `EntityStoreCache`, a view over the raw store. Structures are rebuilt per read: no identity. |
| Zero cache          | `cache: null` → nothing is cached.                                                                                                  |
| Cache keys          | `cache.get(key)` takes one key. `resolveKey(...args)` is kept for composite keys.                                                   |
| Dispatch write path | Unchanged: `applyGatewayDispatch(client.cache, …)`. With structure caches, `client.cache` is a raw adapter over them.               |
| plugin-cache        | Not modified, no changeset.                                                                                                         |

## Out of scope

- Sub-projects B, C, D.
- A structure-serializing `RedisCache` like the reference's proof of concept: Redis goes through `EntityStoreCache`.
- Sweepers / per-entry TTL for `CollectionCache` (a size limit is in scope, see section 2).
- Enumeration on the `Cache` interface. `CollectionCache` is a `Collection`, so it has it natively; `listCached` keeps
  going through an explicit capability check.

## 1. `Cache<Value>` (`src/util/cache.ts`)

The reference interface, plus `synchronous`:

```ts
export interface Cache<
  Value extends StructureMixin<object>,
  Raw extends RawAPIType<Value> = RawAPIType<Value>,
> {
  /** Whether every method answers synchronously, never with a promise. */
  readonly synchronous: boolean;
  /** The function used to construct instances of the structure this cache holds. */
  readonly construct: StructureCreator<Value, Raw>;
  add(data: Partial<Raw>, overwrite?: boolean): Awaitable<Value>;
  clear(): Awaitable<void>;
  delete(key: string): Awaitable<boolean>;
  get(key: string): Awaitable<Value | undefined>;
  getSize(): Awaitable<number>;
  has(key: string): Awaitable<boolean>;
  set(key: string, value: Value): Awaitable<this>;
}

export type StructureCreator<Value, Raw = RawAPIType<Value>> = (data: Partial<Raw>) => Value;

export type CacheConstructor = new <Value extends StructureMixin<object>>(
  creator: StructureCreator<Value>,
  name: CacheEntityName,
  ...args: any[]
) => Cache<Value>;
```

`add`'s key is `keyOf(data)`, supplied per entity (section 4), since most entities are not keyed by `id` alone. This
is the one deviation from the reference's `data: Partial<Raw> & { id: Snowflake }`.

## 2. `CollectionCache` (`src/util/CollectionCache.ts`, exported)

As in the reference: `extends Collection<string, Value> implements Cache<Value, Raw>`.

- `synchronous` is `true`; `getSize()` returns `size`; `get`/`set`/`has`/`delete`/`clear` are `Collection`'s.
- `add(data, overwrite = false)`: when the key exists and `overwrite` is false, `existing[kPatch](data)` and return the
  **same instance**; otherwise `construct(data)`, `set`, and return it.
- Constructor: `(creator, name, options?: { maxSize?: number })`. With `maxSize`, the oldest entry is evicted on
  insert (insertion order), mirroring `MemoryEntityCache`'s bound. Default: unbounded.
- New dependency: `@discordjs/collection` (`^2.1.1`, already installed transitively).

## 3. `EntityStoreCache` (`src/util/EntityStoreCache.ts`, exported)

`Cache<Value>` over a plugin-cache `EntityCache<Raw>`: the "view" of the superseded spec.

| Method                                 | Behaviour                                                                     |
| -------------------------------------- | ----------------------------------------------------------------------------- |
| `get`                                  | `store.get` → build the structure (relations included); `undefined` on a miss |
| `set`                                  | `store.set(key, value.toJSON())`                                              |
| `add`                                  | `store.upsert(keyOf(data), data, { overwrite })` → build `added`              |
| `has` / `delete` / `clear` / `getSize` | forwarded                                                                     |
| `synchronous`                          | `store.synchronous === true`                                                  |

Every store call is guarded: a failure emits `cacheError` and, under `cacheErrors: "miss"`, behaves as a miss
(`undefined`, `false`, `0`, no-op; `add` builds from the data at hand). Methods stay synchronous when the store is.

A third, internal implementation, `NullCache`, backs entities that are not cached: always empty, writes dropped,
`add` builds from the data. It keeps `manager.cache` non-optional.

## 4. Client wiring (`src/GatewayClient.ts`)

```ts
interface GatewayClientOptions {
  /** Builds the cache of each entity. Defaults to `CollectionCache`. */
  cacheConstructor?: CacheConstructor;
  /** A plugin-cache cache: its stores back the managers. `null` disables caching. */
  cache?: PluginCache | null;
  makeCache?: CacheFactory; // unchanged
  policies?: CachePolicies; // unchanged
}

class GatewayClient {
  /** The cache of an entity, created on first use and shared by every manager of that entity. */
  public CacheConstructor<Name extends CacheEntityName>(creator: StructureCreator<…>, name: Name): Cache<…>;
  /** The raw cache every dispatch is written into. */
  public readonly cache: PluginCache | undefined;
}
```

Resolution, once, in the constructor:

| Options                          | Manager caches                                                     | `client.cache` (raw, for dispatches)          |
| -------------------------------- | ------------------------------------------------------------------ | --------------------------------------------- |
| `cache: null`                    | `NullCache`                                                        | `undefined`                                   |
| `cache` and/or `makeCache` given | `EntityStoreCache` per store, `NullCache` for entities without one | the resolved plugin-cache cache, as today     |
| `cacheConstructor` given         | `new cacheConstructor(creator, name)`                              | raw adapters over them, wrapped by `policies` |
| none                             | `CollectionCache`                                                  | raw adapters over them, wrapped by `policies` |

`cacheConstructor` together with `cache` / `makeCache` throws `GatewayTypeError("ClientCacheConflict")`.

`CacheConstructor(creator, name)` memoizes per `name`: guild-scoped managers are created on demand
(`client.guilds.emojis(guildId)`) and must share one cache per entity. The first creator registered for a name wins;
creators never depend on the manager instance (section 5).

### Raw adapter (`src/util/StructureStoreAdapter.ts`, internal)

An `IterableEntityCache<Raw>` over a `Cache<Value>`, so that `applyGatewayDispatch`, its cascades, guild
reconciliation and `withPolicy` keep working unchanged against structure caches:

| Raw method                             | Over the structure cache                                                                                         |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `get(key)`                             | `cache.get(key)?.toJSON()`                                                                                       |
| `upsert(key, data, { overwrite })`     | existing → `existing[kPatch](data)` (same instance); else build and `set`. Returns `{ existing, added }` as raw. |
| `set(key, raw)`                        | existing → patch in place; else build and `set`                                                                  |
| `has` / `delete` / `clear` / `getSize` | forwarded                                                                                                        |
| `keys` / `values` / `entries`          | present when the cache is iterable (`CollectionCache`); otherwise the adapter is not iterable                    |
| `synchronous`                          | `cache.synchronous`                                                                                              |

`CacheSetOptions.ttl` is ignored by the adapter: structure caches have no per-entry TTL (documented; `policies.ttl`
has no effect with `CollectionCache`, `policies.filter` does).

## 5. Manager hierarchy (`src/managers/`)

```ts
export abstract class BaseManager {
  public readonly client: GatewayClient;
}

export abstract class DataManager<Value, Args extends readonly string[]> extends BaseManager {
  /** The cache of the items this manager holds. */
  public abstract readonly cache: Cache<Value>;
  /** A structure is returned as is; a key is looked up in the cache. `null` on a miss. */
  public resolve(value: Value | string): Awaitable<Value | null>;
  /** A structure → its ID; a string → itself; anything else → `null`. As discord.js's `DataManager#resolveId`. */
  public resolveId(value: Value | string): string | null;
  /** The cache key of an entity, the one `cache` takes. Kept from today. */
  public abstract resolveKey(...args: Args): string;
}

export abstract class CachedManager<Name extends CacheEntityName, Value, Args> extends DataManager<
  Value,
  Args
> {
  public readonly cache: Cache<Value>; // client.CacheConstructor(creator, name)
  protected abstract createStructure(data: CacheEntityTypes[Name], ...extras: unknown[]): Value;
  public constructor(client: GatewayClient, name: Name);
  /** @internal */
  public _add(data, cache = true, { id, extras = [] } = {}): Promise<Value>;
  public fetch(...args: [...Args] | [...Args, FetchOptions]): Promise<Value>;
  public refresh(...args: Args): Promise<Value>;
}
```

- `_add`, as in the reference: `existing = await cache.get(id ?? keyOf(data))`. Existing and `cache` true →
  `existing[kPatch](data)`, written back with `cache.set`, return `existing`. Existing and `cache` false →
  `existing[kClone](data)`. Missing → build, `cache.set` when `cache` is true, return it.
  With `CollectionCache` the returned object is the cached instance; with `EntityStoreCache` it is a fresh one.
- **Removed:** `get`, `cached`, `_get`, `entity`, `construct`, `hydrate`, `resolveData`, the public
  `createStructure`, the `EntityCache`-typed `cache` getter, and the `BaseManager = CachedManager` alias
  (`BaseManager` is now the real base class).
- **Kept:** `keyOf`, `resolveKey`, `fetchRaw`, `_hydrate`, `_resolveData`, `cachedGuild`, `guard`; `fetch` and
  `refresh` semantics.
- The non-cached, contextual managers (`ChannelMessageManager`, `GuildChannelManager`, `GuildMemberRoleManager`,
  `GuildEmojiRoleManager`, `ReactionManager`, `ReactionUserManager`, `ThreadChannelMemberManager`,
  `PermissionOverwriteManager`, `ChannelThreadManager`, `GuildTemplateManager`, `WebhookManager`) extend `BaseManager`
  in this sub-project. Giving them a `cache` (making them `DataManager`s) is sub-project B / D.
- **Creators.** The function handed to `CacheConstructor` builds a structure with its relations and binds the client:
  `(data) => bindClient(manager._hydrate(data), client)`. Guild-scoped managers derive what they need (the guild ID)
  from the data, never from the instance, so the first registered creator serves every instance.
- **`ChannelManager`**: `channels.cache` falls back to `threads.cache` on `get` / `has` / `delete`, and routes thread
  types to it on `add` / `set`, so a thread ID keeps resolving like any channel ID.
- **Guard coverage.** Managers stop touching raw stores directly (`this.cache?.delete(...)`, `updateCachedRoles`,
  message patches, …): every such call goes through `this.cache` (guarded) or `guard(...)`.

## 6. Consequences of instance identity

These apply with `CollectionCache` (and any structure-holding cache):

- **Update events.** `Action.before()` reads the previous state before the write. Since the write now patches that
  very instance, every `before` handler returns a `[kClone]()` of what it read, as discord.js's `_update` does.
  Listeners keep receiving `(old, new)` with `old !== new`.
- **Relations.** A structure resolves its relations (a message's author, a channel's guild, …) when it is built.
  They stay current because related instances are patched in place; they go stale only when the related entity is
  deleted and created again. `[kPatchRelations]` keeps dropping the relations a patch invalidates.
- **Synchronous relations.** With a synchronous cache, `_hydrate` is synchronous (it already uses `whenAll`), so
  `CollectionCache#add` and the adapter's `upsert` stay synchronous. A creator returning a promise (asynchronous
  relations behind a structure cache) is rejected with `GatewayTypeError("CacheConstructorAsynchronous")`.
- **Memory.** Every received entity is kept until deleted by a dispatch cascade. `policies.filter`,
  `CollectionCache`'s `maxSize`, or `cache: null` bound it.

## 7. Call sites

Mechanical migration across `src/`, tests, the type-level consumption tests and the README:

| Before                                         | After                                                                               |
| ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| `manager.get(id)`                              | `manager.cache.get(id)`                                                             |
| `manager.get(a, b)`                            | `manager.cache.get(manager.resolveKey(a, b))`                                       |
| `manager.cached(id)`                           | `manager.cache.get(id)` (check `cache.synchronous` where the caller must not await) |
| `manager.cache?.get(key)` (raw)                | `client.cache?.<name>?.get(key)`                                                    |
| `manager.construct(data)`                      | `manager.cache.construct(data)`                                                     |
| `new GatewayClient({ … })` relying on no cache | add `cache: null`                                                                   |

Error codes: `CacheAsynchronous` is reworded (`await cache.get instead`), `CacheRelationsAsynchronous` is removed,
`ClientCacheConflict` and `CacheConstructorAsynchronous` are added.

## 8. Testing

Test-first, per unit:

- `CollectionCache`: `add` patches the same instance, `overwrite` replaces it, `maxSize` evicts, `getSize`.
- `EntityStoreCache`: synchronous store, asynchronous store, throwing store under both `cacheErrors` modes, `set`
  round-trips through `toJSON`.
- `StructureStoreAdapter`: `upsert` returns `{ existing, added }` and preserves identity; iteration; used by
  `applyGatewayDispatch` for a `GUILD_DELETE` cascade.
- Client wiring: the four rows of the resolution table, the conflict error, one cache per entity name.
- `CachedManager`: `_add` identity (`cache: true` → same instance, `cache: false` → clone), `fetch`, `resolve`,
  `resolveId`, `resolveKey`.
- Dispatch: an update event delivers `old !== new` with the old values under `CollectionCache`.
- The existing suites run in both modes where they exercise the cache: `tests/fixtures/cacheModes.ts` gains a
  `CollectionCache` mode next to in-memory and Redis.

Done when `pnpm lint`, `pnpm build`, `pnpm typecheck`, `pnpm test` pass, a `minor` changeset for
`@wolfstar/plugin-gateway` documents the migration table and the new default, and the README is updated.
