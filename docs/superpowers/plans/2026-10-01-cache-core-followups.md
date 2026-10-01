# Cache core (sub-project A) — rulings and follow-ups

Recorded at the end of the execution of `2026-10-01-cache-core.md` (branch `t3code/cached-manager-pattern`, commits `b3623a9..4907e77`).
The spec `../specs/2026-10-01-cache-core-design.md` predates the rulings below: where they differ, the code and these rulings win.

## Rulings made during execution

- Ruling 1: the creator handed to caches (`cache.construct`) is the plain, always-synchronous structure creator (createStructure + bindClient, no relations), exposed as `CachedManager._construct` (@internal); relations come only from `hydrate` (EntityStoreCache) and `refresh` (CollectionCache). `CollectionCache.add` passes newly constructed instances through `refresh` too. `CacheConstructorAsynchronous` is thrown from `refresh`, not from the creator. — the plan's `create` changed `construct`'s old no-relations semantics and would throw for every Redis-backed `cache.construct` — if wrong: `cache.construct` callers get structures without relations where they expected them.
- Ruling 2: if the installed vitest lacks `toHaveBeenCalledExactlyOnceWith`, use `toHaveBeenCalledTimes(1)` + `toHaveBeenCalledWith` — same assertion — no cost.
- Ruling 3: StructureStoreAdapter must read the structure cache without triggering `refresh` (for Map-based caches: `Map.prototype.get.call(cache, key)`), applied in Task 4 — raw reads such as `GuildManager._getShallow` exist to avoid hydration, and a refreshing read recurses guild → channels → guild — if wrong: raw reads through the adapter return instances with relations as of their last `get`, which raw readers do not use anyway.
- Ruling 4: `.oxlintrc.json` (repo root) may be edited to allow `_build` / `_construct` — the only-plugin-gateway constraint is about packages, and 48 warnings are noise — cost if wrong: one lint config line.
- Ruling 5: in the default (structure) mode `policies.filter` must also gate manager writes (`_add`/`fetch`): rejected data is not cached and a stale cached entry is deleted — Global Constraint + option JSDoc say policies apply to every write — cost if wrong: manager writes skip caching for filtered entities.
- Ruling 6: `_add` with cache=true uses `cache.add(data)` whenever the id equals `keyOf(data)` (atomic `upsert` on raw stores, in-place patch on CollectionCache); the get/patch/set path stays only for an explicit differing id — the reference flow costs a non-atomic read+write and a `toJSON()` round-trip on Redis — cost if wrong: `_add` semantics differ slightly from Qjuh's reference.
- Ruling 7: in store-backed mode `cache.synchronous` is true only when every resolved store is synchronous (relations may live in any of them) — otherwise `synchronous` lies when relations are remote — cost if wrong: a fully in-memory entity reports asynchronous in a mixed setup.
- Ruling 8: add a client option `cacheOptions` (per-entity `{ maxSize }`) forwarded to the cache constructor's third argument; no default cap — the spec keeps CollectionCache unbounded by default but promises `maxSize` as a bound, which was unreachable — cost if wrong: one extra public option to maintain.
- Ruling 9: `cacheConstructor` with `cache: null` stays allowed (`null` wins, nothing cached) and is documented — it is an explicit opt-out, not a conflict — cost if wrong: a misconfiguration goes unnoticed.

## Deferred findings

- Task 2: minor (deferred): EntityStoreCache.add `data as Raw` cast could carry a comment
- Task 3: minor (deferred): adapter tests cover only synchronous caches (no async Cache path)
- Task 3: minor (deferred): adapter classes have no per-method JSDoc
- Task 4: minor (deferred): events and listCached deliver freshly built structures, not the cached instances, in default mode (for sub-projects C/D)
- Task 4: minor (deferred): no committed test guards cross-manager refresh recursion
- Task 4: minor (deferred): ChannelCache delete fallback and add/set routing untested; add() with partial data lacking `type` routes to channels
- Task 4: minor (deferred): `cacheConstructor` with `cache: null` silently caches nothing
- Task 4: minor (deferred): PermissionOverwriteManager.guessType treats an uncached role ID as a member in default mode
- Task 4: minor (deferred): a custom cacheConstructor ignoring `refresh` gets structures without relations from `_add`
- Task 4: minor (deferred): a rejected (filtered) update returns a patched clone; the previously held instance is not patched
- Task 5: minor (deferred): most manager/REST suites run only on createInMemoryCache; default CollectionCache path undertested for REST methods (fetch/edit/delete)
- Final review: minor (deferred): adapter delete scans serialise the whole store (~100 ms at 20k messages); implement deleteGuild / prefix fast path later
- Final review: minor (deferred): messages added through managers (REST payloads lack guild_id) survive GUILD_DELETE
- Final review: minor (deferred): guild-scoped `cache.add` without guild_id keys under an empty guild
- Final review: minor (deferred): `client.CacheConstructor(creator, <unmanaged name>)` builds a cache dispatches never fill
- Final review: minor (deferred): guessType falls to "member" for an uncached role ID in default mode
- Final fix wave: `cacheOptions` has no effect on the four entities without a manager (`applicationCommandPermissions`, `auditLogEntries`, `entitlements`, `subscriptions`), undocumented
- Final fix wave: `Cache.add(data, true)` on `CollectionCache` still replaces the cached instance (no internal caller)
- Final fix wave: an overwriting upsert merges, so a full payload omitting a key no longer clears it on a cached instance
- Final fix wave: the recursion guard test fails as a worker crash/timeout rather than a clean assertion
- Environment: `oxfmt --check` fails for every file in a CRLF checkout (`core.autocrlf=true`); formatting was verified through the pre-commit hook only
