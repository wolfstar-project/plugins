# Cache & manager alignment with discord.js RFC #11426 — design

- **Date:** 2026-09-28
- **Packages:** `@wolfstar/plugin-cache`, `@wolfstar/plugin-gateway` (both `0.4.0` → `0.5.0`, breaking under 0.x)
- **References:** [discord.js RFC #11426](https://github.com/discordjs/discord.js/issues/11426) ("Async Caching Layer & Simpler Manager Pattern for `@discordjs/next`"), [discord.js PR #10983](https://github.com/discordjs/discord.js/pull/10983) (PoC: `util/cache.ts`, `managers/CachedManager.ts`, `Client.CacheConstructor`)

## Goal

Align `plugin-cache` and `plugin-gateway`'s Manager / Structure / Cache design ~90% with the RFC and PR #10983, meeting the RFC's two headline goals:

1. **Zero caching** — the library works perfectly with caching completely disabled: every event is emitted, nothing throws, no feature silently breaks.
2. **Complete flexibility** — absolute user control over what is cached (per entity kind and per entry) and for how long (per entry TTL), with no internal assumption that a given entity is cached.

**Success criteria:** a test matrix runs the main events with no cache, a partial cache, and a full cache, and passes in all three; every entity kind can be independently disabled or configured (backend, filter, TTL).

## Decisions (agreed during brainstorming)

| # | Question | Decision |
|---|----------|----------|
| 1 | What does the cache hold? | **Raw API data only.** Per-manager cache instances from a factory (RFC `CacheConstructor`), `construct` lives on the **Manager** (RFC thread: vladfrangu/Qjuh). `upsert` returns `{ existing, added }` (RFC thread: ckohen/didinele). |
| 2 | How does the user control caching? | **Factory + policy:** `makeCache(entity, manager) => EntityCache \| null`, plus an optional per-entity `CachePolicy { filter, ttl }` applied by a `withPolicy` decorator, backend-agnostic. |
| 3 | Who applies gateway dispatch writes? | **`plugin-cache` operations**, now over optional stores (`Partial<CacheEntities>`). `applyCacheOperations` returns per-write results carrying `existing`, removing the gateway's separate `before()` read. `attachCacheToGateway` keeps working without a `GatewayClient`. |
| 4 | Features that inherently need prior state | **Explicit degradation:** always-emitted aggregate events, granular diff events only with a store, `T \| null` previous state, real bugs fixed (`guessType`, `presences.fetch`, `joined`). |

Carried over from earlier scope ([[gateway-parity-scope]]): relation getters stay synchronous, pre-resolved by the manager's `_hydrate` into `kRelations`; no Interaction structures; sharder and broker are untouched (they never read entity caches).

## 1. `plugin-cache` contract

### `EntityCache<Raw>` — the RFC's map-like core

```ts
export interface CacheSetOptions {
  /** Time to live in milliseconds, `null`/`undefined` for no expiry. */
  ttl?: number | null;
}

export interface CacheUpsertResult<Raw> {
  /** The entry before the upsert, `undefined` if it was not cached. */
  existing?: Raw;
  /** The entry after the upsert. */
  added: Raw;
}

export interface EntityCache<Raw> {
  readonly synchronous?: boolean;
  get(key: string): Awaitable<Raw | undefined>;
  set(key: string, value: Raw, options?: CacheSetOptions): Awaitable<void>;
  upsert(key: string, data: Partial<Raw>, options?: CacheUpsertOptions): Awaitable<CacheUpsertResult<Raw>>;
  has(key: string): Awaitable<boolean>;
  delete(key: string): Awaitable<boolean>;
  clear(): Awaitable<void>;
  getSize(): Awaitable<number>;
  deleteGuild?(guildId: string): Awaitable<number | null>;
}

export interface CacheUpsertOptions extends CacheSetOptions {
  /** Replace the entry instead of shallow-merging `data` into it. @default false */
  overwrite?: boolean;
}

/** Iteration is an optional extension (RFC "Problems": remote stores cannot always enumerate cheaply). */
export interface IterableEntityCache<Raw> extends EntityCache<Raw> {
  keys(): Awaitable<string[]>;
  values(): Awaitable<Raw[]>;
  entries(): Awaitable<[key: string, value: Raw][]>;
}

export function isIterableCache<Raw>(cache: EntityCache<Raw>): cache is IterableEntityCache<Raw>;
```

- `upsert` is the RFC's `add`, renamed as the RFC thread proposed, with an explicit key since our keys are composite (`guildId:userId`). Shallow merge unless `overwrite`. When `data` has no existing entry it is stored as-is (`Partial<Raw>` is cast — same trust as today's merge).
- Both built-in stores (`MemoryEntityCache`, `RedisEntityCache`) implement `IterableEntityCache`. Redis `upsert` stays read-then-write (documented, same as today).

### `Cache` is partial

```ts
export type CacheEntities = {
  readonly [Name in CacheEntityName]?: EntityCache<CacheEntityTypes[Name]>;
};
export interface Cache extends CacheEntities {}
```

A missing store means "this entity is not cached": no writes, no scans, reads miss.

### Policies

```ts
export interface CachePolicy<Raw> {
  /** Return `false` to not cache this entry (an already-cached entry under the key is deleted). */
  filter?(value: Raw, key: string): boolean;
  /** Per-entry time to live in ms, `null` for no expiry. Overrides the store's default TTL. */
  ttl?(value: Raw, key: string): number | null;
}
export type CachePolicies = { [Name in CacheEntityName]?: CachePolicy<CacheEntityTypes[Name]> };

export function withPolicy<Raw>(cache: EntityCache<Raw>, policy: CachePolicy<Raw>): EntityCache<Raw>;
```

`withPolicy` wraps `set` and `upsert` (for `upsert` the filter/ttl are evaluated on the merged value; a filtered-out upsert deletes the key and still returns `{ existing, added }` so events keep their data). It preserves `synchronous`, iteration and `deleteGuild` of the wrapped store.

### TTL in memory

`MemoryEntityCache` gains per-entry expiry (`set(..., { ttl })`, plus a store-level default `ttl`), checked lazily on read/has/iteration/size, and an optional `sweepInterval` (ms, `unref`'d timer, `dispose()` to stop it). `maxSize` LRU behaviour is unchanged. Redis maps `ttl` to `PX` per entry; its existing per-entity `ttl` option (seconds) stays as the store default.

### Factory

```ts
export type CacheFactory = (entity: CacheEntityName) => EntityCache<any> | null | undefined;

export interface CreateCacheOptions {
  makeCache: CacheFactory;
  policies?: CachePolicies;
}
export function createCache(options: CreateCacheOptions): Cache;
```

`createInMemoryCache` / `createRedisCache` keep their signatures and gain `entities?: readonly CacheEntityName[]` (opt-in list, default all), `policies?: CachePolicies`, and (memory) `ttl?: number | Partial<Record<CacheEntityName, number>>` / `sweepInterval?`. They build their stores through `createCache`.

### Operations

- `createCacheOperations` stays pure and unchanged in output.
- `applyCacheOperations(cache, operations)` skips operations on missing stores (no scan for `deletePrefix`/`deleteWhere` on a missing store; a scan requires `isIterableCache`, otherwise it is skipped with the store's `deleteGuild` as the only path), uses `upsert` for merges, and returns `CacheOperationResult[]`:

```ts
export interface CacheOperationResult {
  entity: CacheEntityName;
  key: string;
  type: "upsert" | "update" | "delete";
  existing?: unknown;
  added?: unknown;
}
```

  Bulk ops (`deletePrefix`, `deleteWhere`) report one `delete` result per removed key when they enumerate; `deleteGuild` reports none.
- `applyGatewayDispatch` returns the same results. `attachCacheToGateway` is unchanged in behaviour.

## 2. Gateway managers

- `CachedManager` gains an exported alias `BaseManager`. Its `cache` becomes `readonly cache: EntityCache<Raw> | null`, resolved **once** in the constructor via `client.resolveCache(entity, manager)`:
  1. `options.makeCache?.(entity, manager)` if provided (the RFC `CacheConstructor`, receiving the manager);
  2. else `options.cache?.[entity]`;
  3. then wrapped by `withPolicy` when `options.policies?.[entity]` exists;
  4. memoised per entity on the client, so guild-scoped managers created on the fly (`guild.emojis`, …) share the root store and the factory runs once per entity.
- `construct(data)` replaces `createStructure(data)` as the abstract builder (the manager owns structure creation). `createStructure` remains as a deprecated alias that calls `construct`.
- `fetch` is unchanged (fetch-first: `force` skips the cache read, `cache: false` builds without writing, no store → always REST).
- `_add` uses `cache.upsert` (or an in-memory merge with the payload when there is no store or `cache: false`). A new internal `_upsert(data, options)` returns `{ existing: Value | null, added: Value }`, both built.
- **Cache errors** (RFC thread, didinele/vladfrangu): client option `cacheErrors?: "miss" | "throw"` (default `"miss"`). Reads/writes a manager performs go through a guard: on a backend error it emits `client.emit("cacheError", error, { entity, key, operation })` and, with `"miss"`, continues as a miss (fall back to REST / the payload). The existing dispatch-level `cacheFailure` (`"skip" | "emitUncached"`) stays for dispatches.
- `cached()` returns `undefined` when the store is `null` (unchanged) and still throws for async stores. `listCached()` returns `[]` without a store and throws `TypeError` for a non-iterable one.
- Relations keep being pre-resolved by `_hydrate`; each relation reads its own manager, so a partial cache yields `null` for uncached relations without errors.

## 3. Events and zero caching

- `handleDispatch`: `raw` → `applyGatewayDispatch` (when any store exists) → `action.handle(payload, results)`. `action.before()` is removed; previous state comes from `results` (`existing`), built by the relevant manager. With no store for the entity, previous state is `null` (or a partial when its `Partials` flag is set, as today). `DispatchQueue` ordering is unchanged. A cache failure still follows `cacheFailure` (`"skip"` drops the event except READY; `"emitUncached"` emits with `null` previous state).
- Every previous-state parameter of `*Update` / `*Delete` events in `GatewayEvents` is typed `T | null` and documented as "`null` when the <entity> cache is disabled or missed".
- **Aggregate events, always emitted:** `guildEmojisUpdate(guild, emojis)`, `guildStickersUpdate(guild, stickers)`, `guildSoundboardSoundsUpdate(guild, sounds)`. Granular `emojiCreate/Update/Delete`, `stickerCreate/Update/Delete`, `soundboardSoundCreate/Update/Delete` diffs are emitted only when the store exists (they need the previous list).
- **Offline-left guild reconciliation** requires the `guilds` store; without it it is skipped with a one-time `debug` message.
- **Fixes:**
  - `PermissionOverwriteManager.guessType`: no longer assumes "Member" for an uncached role. Order: explicit `type` → id equals the guild id (@everyone → Role) → cached role → fetch the guild's roles once (`GET /guilds/:id/roles`) → if the id is still unknown, `Member`. (A structure argument keeps being typed by its class.)
  - `PresenceManager.fetch`: rejects with an explicit error ("Presences cannot be fetched from the API, they are only received from the gateway; enable the presences cache") — presences still flow through `presenceUpdate` without a cache.
  - `ThreadChannelMixin.joined`: `boolean | null`, `null` when it cannot be determined.
  - `GuildMember.fetchPermissions` and helpers: one guild roles fetch instead of one request per role on cache misses.
- **Partial caches** are independent per entity, e.g. without `messages`, `messageUpdate` gets `old = null`; reactions update only cached messages (as today) and still emit.

## 4. Migration, tests, release

- **Changesets:** `minor` for `@wolfstar/plugin-cache` and `@wolfstar/plugin-gateway`, each with a migration note (`set` options, partial `Cache`, `IterableEntityCache`, `upsert` required on custom stores, `construct`, new `makeCache` / `policies` / `cacheErrors` options, aggregate emoji/sticker/soundboard events, `joined` nullable).
- **Kept compatible:** `createInMemoryCache()` / `createRedisCache()` without `entities` still cache everything; `GatewayClientOptions.cache: Cache` still works; `createStructure` is a deprecated alias.
- **Tests:**
  - plugin-cache: `upsert` (merge, overwrite, existing) on memory and Redis; memory TTL (lazy expiry, sweep, fake timers); `withPolicy` (filter deletes existing entry, per-entry TTL, preserves iteration/synchronous); `createCache` with a factory returning `null`; `applyCacheOperations` on a partial cache (no writes/scans on missing stores) and its results; `entities` opt-in on both built-ins.
  - plugin-gateway: a shared `tests/fixtures/cacheModes.ts` (`none`, `partial` = `users` + `guilds`, `full`) with a `describe.each` over the main events asserting emission, `null`/populated previous state, no throws, and no unexpected REST calls; targeted tests for `guessType` without cache, `presences.fetch` error, aggregate emoji/sticker events, `cacheErrors: "miss"` with a throwing store plus the `cacheError` event, the factory being called once per entity, and `policies` via the client.
  - Existing "no cache" tests are updated where semantics change (`joined` → `null`).
- **Docs:** README sections "Zero caching & cache control" in both packages.
- **Out of scope:** sharder/broker; atomic Redis upsert (Lua); `AsyncIterable` iteration; `Result` types in the public API.
- **Done:** `pnpm lint`, `pnpm build`, `pnpm typecheck`, `pnpm test` pass, changesets present.
