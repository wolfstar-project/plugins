---
"@wolfstar/plugin-cache": minor
---

Add a pluggable `CacheCodec` to the Redis store. `createRedisCache`/`RedisEntityCache` accept a `codec` option (default `jsonCodec()`, matching the previous JSON-only behavior), and a `msgpackCodec()` backed by [`msgpackr`](https://github.com/kriszyp/msgpackr) is available from the new `@wolfstar/plugin-cache/msgpack` subpath (an optional peer dependency, resolved only when that subpath is imported). Encoded values are tagged with the codec's name, so switching _to_ a codec is always safe: entries already written under the default `jsonCodec()` (or before a codec was ever configured) are still read back correctly. Switching _away_ from a previously configured non-default codec additionally requires listing it in the new `legacyCodecs` option, so its entries keep decoding correctly. Codec names `"gz"`, `"br"`, and `"b64"` are reserved.
