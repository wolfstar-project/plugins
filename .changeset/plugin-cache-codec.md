---
"@wolfstar/plugin-cache": minor
---

Add a pluggable `CacheCodec` to the Redis store. `createRedisCache`/`RedisEntityCache` accept a `codec` option (default `jsonCodec()`, matching the previous JSON-only behavior), and a `msgpackCodec()` backed by [`msgpackr`](https://github.com/kriszyp/msgpackr) is available from the new `@wolfstar/plugin-cache/msgpack` subpath (an optional peer dependency, resolved only when that subpath is imported). Encoded values are tagged with the codec's name, so switching a cache's codec is always safe: entries already written under a previous codec (or before a codec was ever configured) are still read back correctly.
