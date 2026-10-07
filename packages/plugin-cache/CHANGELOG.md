# @wolfstar/plugin-cache

## 0.7.0

### Minor Changes

- [#223](https://github.com/wolfstar-project/plugins/pull/223) [`4748f09`](https://github.com/wolfstar-project/plugins/commit/4748f09609e664fad9eede140da141d9f5efa1cc) - Cache the status and start time of voice channels: `VOICE_CHANNEL_STATUS_UPDATE`, `VOICE_CHANNEL_START_TIME_UPDATE` and `CHANNEL_INFO` patch the `status` and `voice_start_time` of a cached channel, and leave an uncached one uncached.

## 0.6.0

### Minor Changes

- [#189](https://github.com/wolfstar-project/plugins/pull/189) [`69129e9`](https://github.com/wolfstar-project/plugins/commit/69129e9910c83f973701d55611ddd123b88d39c4) - Add `@wolfstar/plugin-cache/module`: list it in `modules` in `stars.config` to add the package to the auto imports. It needs framework 6.1 and the optional `@wolfstar/kit` peer; the main entrypoint is unchanged.

## 0.5.1

### Patch Changes

- [#169](https://github.com/wolfstar-project/plugins/pull/169) [`6468763`](https://github.com/wolfstar-project/plugins/commit/646876363da7dc2b730a8fb7ed3011cd11a38859) - discord.js parity for the structure members that had its names but not its contracts.

  **Breaking (`@wolfstar/plugin-gateway`):**

  - `Message#react()` resolves to the `MessageReaction` instead of the message, and counts the bot on the message and on its cached entry. `MessageReaction#react()` bumps its counts too.
  - `Message#attachments`, `Message#stickers`, `Message#messageSnapshots` and `ReactionManager#cache` are `Collection`s instead of arrays: use `.first()`, `.size`, `.get(id)`. Reactions are keyed by emoji ID, or name for Unicode emojis. The `messageReactionRemoveAll` event carries a `Collection` as well.
  - `Message#stickers` holds partial `Sticker` structures instead of raw sticker items (`format_type` → `format`).
  - `Message#partial` is `true` when the message lacks its content, not only its author.
  - `valueOf()` of a structure is its ID when it has one, so structures compare and sort by ID.

  `@wolfstar/plugin-cache`: a `MESSAGE_REACTION_ADD` for the bot's own reaction is no longer counted when the cached reaction already has `me` set.

## 0.5.0

### Minor Changes

- [#149](https://github.com/wolfstar-project/plugins/pull/149) [`a2da4d8`](https://github.com/wolfstar-project/plugins/commit/a2da4d886a9e6b2f4ed54f6ba79b93bdd076746e) - Align the cache with the discord.js RFC [#11426](https://github.com/wolfstar-project/plugins/issues/11426) (zero caching, complete flexibility):

  - `Cache` is now partial: every entity cache is optional, and an entity kind the cache does not hold is not cached. `createInMemoryCache` and `createRedisCache` take `entities` to pick them, and `createCache({ makeCache, policies })` builds a cache out of any store per entity kind (the RFC's `CacheConstructor`).
  - Add policies, `{ filter(value, key), ttl(value, key) }` per entity kind, applied by `withPolicy(store, policy)` to any store: `filter` returning `false` skips the write and deletes the cached entry, `ttl` sets the entry's time-to-live.
  - `EntityCache` gains `upsert(key, data, { overwrite, ttl })`, resolving to `{ existing, added }` (the RFC's `add`), and `set` takes `{ ttl }` in milliseconds (`null` for none). `MemoryEntityCache` now supports time-to-live (`ttl`, `sweepInterval`, `sweep()`, `dispose()`), and `createInMemoryCache` takes `ttl` and `sweepInterval`.
  - Enumerating a store is now optional: `keys`, `values`, and `entries` moved to `IterableEntityCache`, see `isIterableCache`. `applyCacheOperations` skips missing stores and the scans of stores that cannot enumerate, and both it and `applyGatewayDispatch` resolve to `CacheOperationResult[]` (`{ entity, key, type, existing, added }`).

  Migration: custom stores must implement `upsert` and accept `set`'s options; code reading `cache.users` directly must handle `undefined`. `InMemoryCache` and `RedisCache` are now deprecated aliases of `Cache`.

## 0.4.0

### Minor Changes

- [#139](https://github.com/wolfstar-project/plugins/pull/139) [`f8a0bc0`](https://github.com/wolfstar-project/plugins/commit/f8a0bc06386884d5b3b1b631f3fd428cb5a79f46) - Add a pluggable `CacheCodec` to the Redis store. `createRedisCache`/`RedisEntityCache` accept a `codec` option (default `jsonCodec()`, matching the previous JSON-only behavior), and a `msgpackCodec()` backed by [`msgpackr`](https://github.com/kriszyp/msgpackr) is available from the new `@wolfstar/plugin-cache/msgpack` subpath (an optional peer dependency, resolved only when that subpath is imported). Encoded values are tagged with the codec's name, so switching _to_ a codec is always safe: entries already written under the default `jsonCodec()` (or before a codec was ever configured) are still read back correctly. Switching _away_ from a previously configured non-default codec additionally requires listing it in the new `legacyCodecs` option, so its entries keep decoding correctly. Codec names `"gz"`, `"br"`, and `"b64"` are reserved.

## 0.3.0

### Minor Changes

- [#128](https://github.com/wolfstar-project/plugins/pull/128) [`b2ff9ed`](https://github.com/wolfstar-project/plugins/commit/b2ff9ed2e20cae0e48f49ce4e38d02784bbc88b0) - Resume gateway sessions across restarts. `GatewayClient` gains a `sessionStore` option (and `sessionStoreTimeout`), read once per shard and mirrored in memory, with background writes collapsed per shard; store failures are reported as `GatewaySessionStoreError`s and fall back to identifying. `GatewayClient#destroy({ resumable: true })` closes the shards with a resumable code and keeps their sessions stored, for the next process to resume them. `@wolfstar/plugin-cache` ships `createRedisSessionStore`, with a `ttl` (10 minutes by default), and the `GatewaySessionStore`/`GatewaySessionInfo` types.

- [#131](https://github.com/wolfstar-project/plugins/pull/131) [`4203b27`](https://github.com/wolfstar-project/plugins/commit/4203b27e9f518a94cfabd6cb9443713853ae9aa3) - Add a synchronous read path for in-memory caches. `EntityCache` gains an optional, readonly `synchronous` flag, `true` on `MemoryEntityCache` (`createInMemoryCache`) and `false` on `RedisEntityCache` (`createRedisCache`, compressed or not); a store leaving it out is treated as asynchronous. Every `CachedManager` gains `cached(...ids)`, which takes the same arguments as `get` and returns the same structure, relations included, without a promise: `client.members.cached(guildId, userId)`. It returns `undefined` on a miss or without a cache, and throws a `TypeError` on an asynchronous cache instead of reporting a miss it cannot know about. The existing asynchronous methods are unchanged.

### Patch Changes

- [#123](https://github.com/wolfstar-project/plugins/pull/123) [`354dec1`](https://github.com/wolfstar-project/plugins/commit/354dec1644b9485375a642b7fcd733cbe52b5489) - Add a `./register` subpath export. The Stars CLI build imports `<name>/register` for every `@wolfstar/plugin-*` dependency of a project, so these packages crashed their consumers at startup with `ERR_PACKAGE_PATH_NOT_EXPORTED`. The entrypoint is a no-op: none of them has an `@wolfstar/http-framework` `Plugin` hook to register.

## 0.2.0

### Minor Changes

- [#119](https://github.com/wolfstar-project/plugins/pull/119) [`f762ba2`](https://github.com/wolfstar-project/plugins/commit/f762ba27b3ad58b05129cea11e81822d5af78663) - Index the guild-scoped Redis entity caches by guild (`indexGuilds`, on by default), so a `GUILD_DELETE` drops a guild's entries through the index instead of scanning every entry of every entity cache. `EntityCache` gains an optional `deleteGuild`, which `applyGatewayDispatch` uses when a store implements it and falls back to the scans otherwise.

## 0.1.0

### Minor Changes

- [#104](https://github.com/wolfstar-project/plugins/pull/104) [`90d77c9`](https://github.com/wolfstar-project/plugins/commit/90d77c9d08ef6a859977084418f0da3cd42d8e83) - Count reactions and poll votes into the cached message (`MESSAGE_REACTION_*`, `MESSAGE_POLL_VOTE_*`), with an optional `{ clientUserId }` context on `applyGatewayDispatch`/`createCacheOperations` for the `me` and `me_voted` flags, and a new `update` cache operation.

- [#113](https://github.com/wolfstar-project/plugins/pull/113) [`2c5f29d`](https://github.com/wolfstar-project/plugins/commit/2c5f29df9f53c96993755859f8cb6935a4309d4b) - Add gateway actions and a unified startup method, use `@discordjs/core` for API operations, optimize structure data during construction and patches, and provide a standalone gateway cache adapter.

- [#92](https://github.com/wolfstar-project/plugins/pull/92) [`6da7e99`](https://github.com/wolfstar-project/plugins/commit/6da7e999286e3d3fa755334882dea76e643ab336) - Add `@wolfstar/plugin-cache`, implementing the cache RFC ([#55](https://github.com/wolfstar-project/plugins/issues/55)): a storage-agnostic `Cache` interface with one `EntityCache` per Discord entity, `applyGatewayDispatch` to write gateway dispatches into it (cascading deletes included), and two stores: `createInMemoryCache` (optionally LRU-bounded) and `createRedisCache` (per-entity TTL and optional gzip/brotli compression).

### Patch Changes

- [#94](https://github.com/wolfstar-project/plugins/pull/94) [`7db3af5`](https://github.com/wolfstar-project/plugins/commit/7db3af571b8d27e6becc36581b0984d5099887bb) - Write and delete Redis values together with their index entry in a single `MULTI` transaction, prune expired index entries on every write when a `ttl` is set, and reject unreadable values (invalid JSON or corrupt compressed bytes) with a `CacheValueError` naming the key.

- [#110](https://github.com/wolfstar-project/plugins/pull/110) [`769d943`](https://github.com/wolfstar-project/plugins/commit/769d943f0606c90cad08db5dd4f8eec179de215d) - Cache the creator of scheduled events from `GUILD_SCHEDULED_EVENT_CREATE` and `GUILD_SCHEDULED_EVENT_UPDATE` in `users`.
