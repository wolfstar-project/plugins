# @wolfstar/plugin-cache

## 0.1.0

### Minor Changes

- [#104](https://github.com/wolfstar-project/plugins/pull/104) [`90d77c9`](https://github.com/wolfstar-project/plugins/commit/90d77c9d08ef6a859977084418f0da3cd42d8e83) - Count reactions and poll votes into the cached message (`MESSAGE_REACTION_*`, `MESSAGE_POLL_VOTE_*`), with an optional `{ clientUserId }` context on `applyGatewayDispatch`/`createCacheOperations` for the `me` and `me_voted` flags, and a new `update` cache operation.

- [#113](https://github.com/wolfstar-project/plugins/pull/113) [`2c5f29d`](https://github.com/wolfstar-project/plugins/commit/2c5f29df9f53c96993755859f8cb6935a4309d4b) - Add gateway actions and a unified startup method, use `@discordjs/core` for API operations, optimize structure data during construction and patches, and provide a standalone gateway cache adapter.

- [#92](https://github.com/wolfstar-project/plugins/pull/92) [`6da7e99`](https://github.com/wolfstar-project/plugins/commit/6da7e999286e3d3fa755334882dea76e643ab336) - Add `@wolfstar/plugin-cache`, implementing the cache RFC ([#55](https://github.com/wolfstar-project/plugins/issues/55)): a storage-agnostic `Cache` interface with one `EntityCache` per Discord entity, `applyGatewayDispatch` to write gateway dispatches into it (cascading deletes included), and two stores: `createInMemoryCache` (optionally LRU-bounded) and `createRedisCache` (per-entity TTL and optional gzip/brotli compression).

### Patch Changes

- [#94](https://github.com/wolfstar-project/plugins/pull/94) [`7db3af5`](https://github.com/wolfstar-project/plugins/commit/7db3af571b8d27e6becc36581b0984d5099887bb) - Write and delete Redis values together with their index entry in a single `MULTI` transaction, prune expired index entries on every write when a `ttl` is set, and reject unreadable values (invalid JSON or corrupt compressed bytes) with a `CacheValueError` naming the key.

- [#110](https://github.com/wolfstar-project/plugins/pull/110) [`769d943`](https://github.com/wolfstar-project/plugins/commit/769d943f0606c90cad08db5dd4f8eec179de215d) - Cache the creator of scheduled events from `GUILD_SCHEDULED_EVENT_CREATE` and `GUILD_SCHEDULED_EVENT_UPDATE` in `users`.
