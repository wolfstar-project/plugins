---
"@wolfstar/plugin-cache": minor
---

Add `@wolfstar/plugin-cache`, implementing the cache RFC (#55): a storage-agnostic `Cache` interface with one `EntityCache` per Discord entity, `applyGatewayDispatch` to write gateway dispatches into it (cascading deletes included), and two stores: `createInMemoryCache` (optionally LRU-bounded) and `createRedisCache` (per-entity TTL and optional gzip/brotli compression).
