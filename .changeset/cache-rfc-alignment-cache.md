---
"@wolfstar/plugin-cache": minor
---

Align the cache with the discord.js RFC #11426 (zero caching, complete flexibility):

- `Cache` is now partial: every entity cache is optional, and an entity kind the cache does not hold is not cached. `createInMemoryCache` and `createRedisCache` take `entities` to pick them, and `createCache({ makeCache, policies })` builds a cache out of any store per entity kind (the RFC's `CacheConstructor`).
- Add policies, `{ filter(value, key), ttl(value, key) }` per entity kind, applied by `withPolicy(store, policy)` to any store: `filter` returning `false` skips the write and deletes the cached entry, `ttl` sets the entry's time-to-live.
- `EntityCache` gains `upsert(key, data, { overwrite, ttl })`, resolving to `{ existing, added }` (the RFC's `add`), and `set` takes `{ ttl }` in milliseconds (`null` for none). `MemoryEntityCache` now supports time-to-live (`ttl`, `sweepInterval`, `sweep()`, `dispose()`), and `createInMemoryCache` takes `ttl` and `sweepInterval`.
- Enumerating a store is now optional: `keys`, `values`, and `entries` moved to `IterableEntityCache`, see `isIterableCache`. `applyCacheOperations` skips missing stores and the scans of stores that cannot enumerate, and both it and `applyGatewayDispatch` resolve to `CacheOperationResult[]` (`{ entity, key, type, existing, added }`).

Migration: custom stores must implement `upsert` and accept `set`'s options; code reading `cache.users` directly must handle `undefined`. `InMemoryCache` and `RedisCache` are now deprecated aliases of `Cache`.
