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
