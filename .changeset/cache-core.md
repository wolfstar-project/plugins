---
"@wolfstar/plugin-gateway": minor
---

**Breaking:** managers now expose the discord.js RFC `Cache` as `manager.cache`, built by a client-level `cacheConstructor`.

- **New default.** Without a cache option, every entity is cached in memory by `CollectionCache`, a `Collection` of structure instances that updates patch in place. Pass `cache: null` to cache nothing (the previous default).
- **Memory.** The default keeps every received entity in memory until a dispatch removes it: nothing expires. Bound it with the new `cacheOptions` (`cacheOptions: { messages: { maxSize: 1_000 } }`, the oldest entry is evicted first, `0` holds nothing), with `policies.filter` (`policies: { users: { filter: (user) => !user.bot } }`), or cache nothing with `cache: null`.
- **Instances.** Only `manager.cache.get` (and `fetch` / `resolve`, which read it) returns the cached instance. The structures delivered by events (the message of `messageCreate`, the `new` of update events) and by `listCached` are freshly built, and a structure's `guild` relation is a copy of the cached guild.
- `cacheConstructor` receives `(creator, name, options)`, `options` being the exported `CacheConstructorOptions`: `keyOf`, `refresh`, and the entity's `cacheOptions`. Extending `CollectionCache` is the recommended way; a cache that is not a `Map` gets no dispatch cascades, `READY` reconciliation, emoji / sticker diff events, or `listCached`.
- `manager.cache` is always defined: `get`, `set`, `has`, `delete`, `add`, `clear`, `getSize`, `construct`, and `synchronous`. `CollectionCache`, `EntityStoreCache`, `NullCache`, and the `Cache` / `CacheConstructor` types are exported.
- `cache` / `makeCache` (`@wolfstar/plugin-cache`) keep working: managers view the raw stores through `EntityStoreCache`. `cacheConstructor` and `cacheOptions` cannot be combined with them (it throws), and `cache: null` wins over both.
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
