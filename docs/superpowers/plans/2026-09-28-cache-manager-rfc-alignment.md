# Cache & manager RFC alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `plugin-cache` / `plugin-gateway` work perfectly with zero caching and give users full per-entity, per-entry control of caching, aligned with discord.js RFC #11426 / PR #10983.

**Architecture:** `plugin-cache` keeps raw-only stores, gains `upsert`, per-write TTL, optional iteration, a partial `Cache`, `withPolicy` and a `createCache` factory; operations skip missing stores and return results. `plugin-gateway` resolves every store once at client construction (`makeCache` + `policies`), managers build structures via `construct`, write through `upsert`, and guard backend errors (`cacheErrors`). Zero-cache degradations are fixed or made explicit.

**Tech Stack:** TypeScript 7, vitest, pnpm/turbo, discord-api-types v10, `@discordjs/ws`/`core`.

**Spec:** `docs/superpowers/specs/2026-09-28-cache-manager-rfc-alignment-design.md`

## Global Constraints

- Packages bump `0.4.0 → 0.5.0` via `minor` changesets (breaking under 0.x).
- The cache never stores structures, only raw API data.
- Every `EntityCache` method returns `Awaitable`; `synchronous: true` stores must never return a promise.
- `createInMemoryCache()` / `createRedisCache()` without `entities` still create every store.
- `GatewayClientOptions.cache: Cache` keeps working.
- Comments/JSDoc follow the surrounding style (TSDoc, `@remarks`, `@example`).
- Done = `pnpm lint`, `pnpm build`, `pnpm typecheck`, `pnpm test` all green.

## Spec deviations (decided while reading the code)

- **`action.before()` is kept.** It reads the previous state *before* the write with relations hydrated, and diffs lists (emojis/stickers); rebuilding ~30 handlers from `results.existing` is a large regression risk for a perf-only gain. `applyCacheOperations` still returns `CacheOperationResult[]` (useful to `attachCacheToGateway` users), and handlers skip their read when the entity has no store (the manager read short-circuits).
- **`makeCache(entity)` does not receive the manager.** Stores are resolved once at client construction so dispatch writes and managers share the same (policy-wrapped) store; many entities (emojis, bans, stickers…) have no root manager.
- **No one-time `debug` for skipped guild reconciliation**: the base client has no debug event; it is documented instead.

## Review Focus

- A policy `filter` rejecting an *update* of an already-cached entry → the stale entry must be deleted, not kept.
- A store present but not iterable (custom user store) on `GUILD_DELETE` / `listCached` → no crash in dispatch (skip scan), explicit `TypeError` in `listCached`.
- Memory TTL entry read after expiry via `has` / `getSize` / `keys` → treated as absent everywhere, not only in `get`.
- A throwing store with `cacheErrors: "miss"` on `fetch` → REST fallback + `cacheError` event, never an unhandled rejection on the sync path.
- Partial cache where `members` exists but `guilds` does not → member events still emit with `guild: null` relations.

---

### Task 1: plugin-cache types, policy and factory

**Files:**
- Modify: `packages/plugin-cache/src/lib/types.ts`
- Create: `packages/plugin-cache/src/lib/policy.ts`
- Modify: `packages/plugin-cache/src/index.ts`
- Test: `packages/plugin-cache/tests/policy.test.ts`

**Interfaces — Produces:**
```ts
export interface CacheSetOptions { ttl?: number | null }
export interface CacheUpsertOptions extends CacheSetOptions { overwrite?: boolean }
export interface CacheUpsertResult<Raw> { existing?: Raw; added: Raw }
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
export interface IterableEntityCache<Raw> extends EntityCache<Raw> {
  keys(): Awaitable<string[]>; values(): Awaitable<Raw[]>; entries(): Awaitable<[key: string, value: Raw][]>;
}
export function isIterableCache<Raw>(cache: EntityCache<Raw>): cache is IterableEntityCache<Raw>;
export type CacheEntities = { readonly [N in CacheEntityName]?: EntityCache<CacheEntityTypes[N]> };
export interface CachePolicy<Raw> { filter?(value: Raw, key: string): boolean; ttl?(value: Raw, key: string): number | null }
export type CachePolicies = { [N in CacheEntityName]?: CachePolicy<CacheEntityTypes[N]> };
export type CacheFactory = (entity: CacheEntityName) => EntityCache<any> | null | undefined;
export interface CreateCacheOptions { makeCache: CacheFactory; policies?: CachePolicies }
export function withPolicy<Raw>(cache: EntityCache<Raw>, policy: CachePolicy<Raw>): EntityCache<Raw>;
export function createCache(options: CreateCacheOptions): Cache;
```

- [ ] **Step 1: Write failing tests** in `tests/policy.test.ts`: `withPolicy` filter skips `set` and deletes an existing entry; filter on `upsert` evaluates the merged value, deletes the key and still returns `{ existing, added }`; `ttl(value)` is passed to the wrapped `set`/`upsert` as `{ ttl }`; wrapper keeps `synchronous` and is `isIterableCache` iff the inner store is; `createCache` omits entities whose factory returns `null`/`undefined`, applies policies, returns a frozen object.
- [ ] **Step 2: Run** `pnpm vitest run packages/plugin-cache/tests/policy.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** the types in `types.ts` and `policy.ts` (a `PolicyEntityCache` class delegating every method; iteration methods defined only when the inner store has them, via a subclass `IterablePolicyEntityCache`; `synchronous` mirrors the inner store and the wrapper never introduces a promise for sync stores — use `whenAll`-style helpers: if the inner result is not a promise, stay sync). Export from `index.ts`.
- [ ] **Step 4: Run** the test → PASS.
- [ ] **Step 5: Commit** `feat(plugin-cache): add upsert, policies and createCache factory types`.

### Task 2: MemoryEntityCache TTL + upsert, createInMemoryCache options

**Files:** Modify `packages/plugin-cache/src/lib/memory.ts`; Test `packages/plugin-cache/tests/memory.test.ts`.

**Interfaces — Produces:**
```ts
new MemoryEntityCache<Raw>(maxSize?: number, options?: { ttl?: number | null; sweepInterval?: number | null })
MemoryEntityCache#upsert(key, data, options?): CacheUpsertResult<Raw>
MemoryEntityCache#sweep(): number   // removes expired entries, returns count
MemoryEntityCache#dispose(): void   // stops the sweep timer
interface InMemoryCacheOptions {
  maxSize?: number | Partial<Record<CacheEntityName, number>>;
  ttl?: number | Partial<Record<CacheEntityName, number>>; // ms
  sweepInterval?: number | null;                           // ms
  entities?: readonly CacheEntityName[];
  policies?: CachePolicies;
}
createInMemoryCache(options?): Cache  // InMemoryCache type becomes Partial
```

- [ ] **Step 1: Failing tests** (fake timers): `set(k, v, { ttl: 100 })` → after 101 ms `get`/`has` miss, `getSize()` and `keys()` exclude it; store default `ttl` applies when no per-set ttl; `ttl: null` on set overrides the default (never expires); `sweepInterval` removes expired entries without reads; `dispose()` stops it; `upsert` merges shallowly, `overwrite` replaces, returns `existing` (undefined when absent); `maxSize: 0` upsert returns `added` but stores nothing; `entities: ["users"]` yields only `users`; `policies` wraps stores.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**: store entries as `{ value, expiresAt: number | null }`; private `#live(key)` drops expired entries lazily; `upsert` = get + `mergeValues` + set (import `mergeValues` from operations would be circular with `CacheEntityNames` already imported — move `mergeValues` into a new `lib/merge.ts` re-exported from `operations.ts`); sweep timer `unref()`'d. `createInMemoryCache` builds through `createCache({ makeCache, policies })`.
- [ ] **Step 4: Run** → PASS; also run the whole plugin-cache suite.
- [ ] **Step 5: Commit** `feat(plugin-cache): add ttl and upsert to the in-memory cache`.

### Task 3: RedisEntityCache per-write TTL + upsert, createRedisCache options

**Files:** Modify `packages/plugin-cache/src/lib/redis.ts`; Test `packages/plugin-cache/tests/redis.test.ts`.

**Interfaces — Produces:** `RedisEntityCache#set(key, value, { ttl?: number | null })` (ms, overrides the store `ttl` seconds default; `null` = no expiry); `RedisEntityCache#upsert`; `RedisCacheOptions.entities?`, `RedisCacheOptions.policies?`.

- [ ] **Step 1: Failing tests** with `FakeRedis`: `set(k, v, { ttl: 1500 })` issues `PX 1500` and scores the index `now + 1500`; `{ ttl: null }` on a store with default ttl writes without PX; `upsert` merges and returns `existing`; `entities`/`policies` on `createRedisCache`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**: compute `milliseconds = options?.ttl !== undefined ? options.ttl : this.ttl === undefined ? null : Math.round(this.ttl * 1000)` and branch on `milliseconds === null`; `prune()` runs whenever any TTL may exist (always prune — it is a single cheap `ZREMRANGEBYSCORE`); `upsert` = get + merge + set, documented as read-then-write.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(plugin-cache): add per-write ttl and upsert to the redis cache`.

### Task 4: operations over a partial cache, with results

**Files:** Modify `packages/plugin-cache/src/lib/operations.ts`, `lib/gateway.ts`, `index.ts`; Test `packages/plugin-cache/tests/operations.test.ts`.

**Interfaces — Produces:**
```ts
export interface CacheOperationResult { entity: CacheEntityName; key: string; type: "upsert" | "update" | "delete"; existing?: unknown; added?: unknown }
applyCacheOperations(cache: Cache, operations): Promise<CacheOperationResult[]>
applyGatewayDispatch(cache: Cache, payload, context?): Promise<CacheOperationResult[]>
```

- [ ] **Step 1: Failing tests**: a `GUILD_CREATE` into `createCache({ makeCache: (e) => e === "guilds" ? new MemoryEntityCache() : null })` writes only the guild; `GUILD_DELETE` on a partial cache does not throw and does not scan missing stores; a present non-iterable store (wrap a memory store in a plain object exposing only the base methods) is skipped by `deletePrefix`/`deleteWhere` without throwing; results carry `existing`/`added` for upsert (merge and non-merge), `update`, `delete`, and one `delete` per removed key for scans.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**: `const store = cache[operation.store]; if (!store) continue;`; upsert → `store.upsert(key, raw, { overwrite: !merge })`; update → get, then `set` if defined; delete → `get` then `delete` only when results need `existing` (always read: `existing = await store.get(key)`); scans guarded by `isIterableCache`.
- [ ] **Step 4: Run** → PASS, whole plugin-cache suite green.
- [ ] **Step 5: Commit** `feat(plugin-cache): apply operations to partial caches and return results`.

### Task 5: GatewayClient store resolution, policies and cacheErrors

**Files:** Modify `packages/plugin-gateway/src/GatewayClient.ts`, `src/util/events.ts`, every `client.cache?.<entity>.` access (`ChannelManager.ts`, `GuildMemberManager.ts`, `UserManager.ts`, `PermissionOverwriteManager.ts`, `Guild.ts`, `dispatch.ts`) to `client.cache?.<entity>?.`; Test `packages/plugin-gateway/tests/cache-control.test.ts`.

**Interfaces — Produces:**
```ts
GatewayClientOptions.makeCache?: CacheFactory;
GatewayClientOptions.policies?: CachePolicies;
GatewayClientOptions.cacheErrors?: "miss" | "throw"; // default "miss"
GatewayClient#cache: Cache | undefined            // undefined when no store at all
GatewayClient#cacheErrors: "miss" | "throw"
GatewayEventMap.cacheError: [error: unknown, context: CacheErrorContext]
interface CacheErrorContext { entity: CacheEntityName; key: string | null; operation: "get" | "set" | "upsert" | "delete" }
GatewayEvents.CacheError = "cacheError"
```

- [ ] **Step 1: Failing tests**: `makeCache` called exactly once per entity name at construction; returning `null` for `members` → `client.members.cache === undefined`, `client.cache.members === undefined`; `policies.users.filter = () => false` → a `USER_UPDATE`/`GUILD_CREATE` does not store users; `cache` + `policies` combined applies policies; a client with `makeCache: () => null` has `client.cache === undefined`; `dropUnlistedGuilds` with a cache lacking `guilds` does nothing.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**: in the constructor, `const source = options.makeCache ?? (options.cache ? (e) => options.cache![e] : null)`; `this.cache = source ? createCache({ makeCache: source, policies: options.policies }) : undefined`, and set it to `undefined` when it has no store. `dropUnlistedGuilds` requires `this.cache?.guilds` and `isIterableCache`. Add `cacheError` to the event map/enum.
- [ ] **Step 4: Run** → PASS, gateway suite green.
- [ ] **Step 5: Commit** `feat(plugin-gateway): resolve entity caches through makeCache and policies`.

### Task 6: CachedManager — construct, upsert, error guard, listCached

**Files:** Modify `packages/plugin-gateway/src/managers/CachedManager.ts`, every manager implementing `createStructure` (rename to `construct`), `GuildEmojiManager.ts`, `GuildStickerManager.ts`, `PresenceManager.ts`, `VoiceStateManager.ts` (`listCached`), `src/managers/index.ts` (export `BaseManager`); Test `packages/plugin-gateway/tests/cached-manager.test.ts`.

**Interfaces — Produces:** `CachedManager#construct(data): Value` (abstract); `CachedManager#createStructure(data)` (deprecated, calls `construct`); `export { CachedManager as BaseManager }`; `protected guard<T>(operation, key, run: () => Awaitable<T>, fallback: T): Awaitable<T>`.

- [ ] **Step 1: Failing tests**: a store whose `get` throws → `fetch` falls back to REST (mock `client.api.users.get`) and emits `cacheError` with `{ entity: "users", key, operation: "get" }`; with `cacheErrors: "throw"` `fetch` rejects; a sync store throwing inside `cached()` emits `cacheError` and returns `undefined` under `"miss"`; `_add` on a store calls `upsert` once (spy) and no `get`; `listCached` throws `TypeError` for a non-iterable store and returns `[]` without store; `createStructure` still works.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**: `guard` catches sync throws and promise rejections, emits `cacheError`, then rethrows (`"throw"`) or returns the fallback. `getByKey` → `guard("get", key, () => cache.get(key), undefined)`. `_add` → with a store and `cache` true: `const { added } = await guard("upsert", key, () => cache.upsert(key, data), { added: mergeValues(undefined, data) })`; otherwise `existing = await guard("get", ...)`, merge in memory. `storeRaw` → guarded `set`. Rename `createStructure` implementations with `sed -i 's/public createStructure(/public construct(/'` over `src/managers/*.ts` (excluding `CachedManager.ts`), then fix `_hydrate` default to call `construct`.
- [ ] **Step 4: Run** → PASS, gateway suite green.
- [ ] **Step 5: Commit** `feat(plugin-gateway): align managers with the RFC manager pattern`.

### Task 7: zero-cache fixes and aggregate events

**Files:** Modify `util/dispatch.ts`, `util/events.ts`, `managers/PermissionOverwriteManager.ts`, `managers/PresenceManager.ts`, `managers/ChannelManager.ts`, `structures/channels/mixins/ThreadChannelMixin.ts`, `managers/GuildMemberRoleManager.ts`; Test `packages/plugin-gateway/tests/zero-cache.test.ts`.

**Interfaces — Produces:** events `guildEmojisUpdate: [guildId: string, emojis: GuildEmoji[]]`, `guildStickersUpdate: [guildId: string, stickers: Sticker[]]` (`GatewayEvents.GuildEmojisUpdate`, `GatewayEvents.GuildStickersUpdate`); `ThreadChannelMixin#joined: boolean | null`.

- [ ] **Step 1: Failing tests** (client without cache): `GUILD_EMOJIS_UPDATE` emits `guildEmojisUpdate` with built emojis and no granular events; with a cache it emits both; same for stickers; `permissionOverwrites.edit("<roleId>")` without cache fetches guild roles once (mock `api.guilds.getRoles`) and sends `type: Role`; unknown id → `Member`; `presences.fetch` rejects with the message mentioning the gateway and the presences cache; a thread built without the `threadMembers` store and no `member` field has `joined === null`; `member.roles.fetch()` with 3 uncached roles calls `api.guilds.getRoles` once and never `getRole`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**: emoji/sticker multi-handlers push the aggregate event first and diff only `if (previous)`; `listCached` in their `before` is skipped when the store is missing/non-iterable (return `undefined`); `guessType` falls back to `client.roles.fetchAll(guildId)`; `joined` relation set only when `client.cache?.threadMembers` exists, getter returns `this[kRelations].joined ?? (member field ? true : null)`; `GuildMemberRoleManager.fetch` reads `client.roles.get` for each id and, on any miss, uses one `fetchAll`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `fix(plugin-gateway): make cache-dependent features degrade explicitly without a cache`.

### Task 8: cache-mode test matrix, docs and changesets

**Files:** Create `packages/plugin-gateway/tests/fixtures/cacheModes.ts`, `packages/plugin-gateway/tests/cache-modes.test.ts`; Modify `packages/plugin-cache/README.md`, `packages/plugin-gateway/README.md`; Create `.changeset/cache-rfc-alignment-cache.md`, `.changeset/cache-rfc-alignment-gateway.md`.

- [ ] **Step 1: Write the matrix**: `cacheModes = { none: undefined, partial: () => createInMemoryCache({ entities: ["users", "guilds"] }), full: () => createInMemoryCache() }`; `describe.each` dispatches GUILD_CREATE, CHANNEL_CREATE/UPDATE, MESSAGE_CREATE/UPDATE/DELETE, GUILD_MEMBER_ADD/UPDATE/REMOVE, GUILD_ROLE_CREATE/UPDATE/DELETE, USER_UPDATE, MESSAGE_REACTION_ADD, GUILD_EMOJIS_UPDATE and asserts: each event emitted once, previous state `null` for `none`, populated for `full` where applicable, no `error` event, and `client.rest` request spy not called.
- [ ] **Step 2: Run** → fix any failure found (a failure here is a real zero-cache bug; fix in the owning source file).
- [ ] **Step 3: Docs**: "Zero caching & cache control" README sections (makeCache, entities, policies, ttl/sweepInterval, cacheErrors, behaviour table without a store).
- [ ] **Step 4: Changesets** (`minor` each) with migration notes.
- [ ] **Step 5: Verify** `pnpm lint && pnpm build && pnpm typecheck && pnpm test`; commit `test(plugin-gateway): cover events across cache modes` and `docs: document cache control`.
