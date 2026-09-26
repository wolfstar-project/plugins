---
"@wolfstar/plugin-cache": minor
"@wolfstar/plugin-gateway": minor
---

Add a synchronous read path for in-memory caches. `EntityCache` gains an optional, readonly `synchronous` flag, `true` on `MemoryEntityCache` (`createInMemoryCache`) and `false` on `RedisEntityCache` (`createRedisCache`, compressed or not); a store leaving it out is treated as asynchronous. Every `CachedManager` gains `cached(...ids)`, which takes the same arguments as `get` and returns the same structure, relations included, without a promise: `client.members.cached(guildId, userId)`. It returns `undefined` on a miss or without a cache, and throws a `TypeError` on an asynchronous cache instead of reporting a miss it cannot know about. The existing asynchronous methods are unchanged.
