# Pluggable codec for `@wolfstar/plugin-cache`'s Redis store

- Issue: [wolfstar-project/plugins#137](https://github.com/wolfstar-project/plugins/issues/137)
- Scope: MVP slice of the RFC — pluggable `CacheCodec` (JSON default, msgpack built-in). Snowflake packing, per-entity `project`, and the in-memory `project` option are explicitly out of scope here and tracked as follow-ups.

## Problem

`RedisEntityCache#serialize`/`#deserialize` (`packages/plugin-cache/src/lib/redis.ts`) hardcode `JSON.stringify`/`JSON.parse`. There is no way to plug in a denser, lossless format (e.g. msgpack), which the RFC wants for large bots where most Redis memory is members/users/messages.

## API

New `packages/plugin-cache/src/lib/codec.ts`:

```ts
export interface CacheCodec {
  readonly name: string;
  encode(value: unknown): Buffer | string;
  decode(data: Buffer | string): unknown;
}

export function jsonCodec(): CacheCodec; // name: "json"
```

`RedisEntityCacheOptions`/`RedisCacheOptions` gain `codec?: CacheCodec`, default `jsonCodec()`. `CacheCodec`/`jsonCodec` re-exported from `src/index.ts`.

`msgpackCodec()` lives in its own `src/msgpack.ts`, exported only from a new `./msgpack` subpath — matching how `plugin-logger` isolates `consola`/`evlog`/`winston` behind their own subpaths so importing the package's main entrypoint never forces resolution of an optional dependency. `msgpackr` is added as a `peerDependency` (`peerDependenciesMeta: { optional: true }`) and a `devDependency` for tests.

## Storage format

Current format: `<compressionMarker><base64>` or raw JSON text, where `compressionMarker` is `"gz:"`, `"br:"`, or absent. This changes to:

```
<codecMarker><compressionMarker-or-b64Marker><payload>
```

- `codecMarker` is `""` for the default `jsonCodec` (byte-for-byte backward compatible with every value already written) and `"<codec.name>:"` for any other codec (e.g. `"msgpack:"`).
- If the encoded value is compressed, `compressionMarker` is `"gz:"`/`"br:"` as today, and `payload` is base64 of the compressed bytes.
- If the encoded value is **not** compressed and `codec.encode` returned a `Buffer` (e.g. msgpack), a new `"b64:"` marker is used and `payload` is base64 of the raw bytes — Redis string values must be safe UTF-8, so raw binary can't be stored unescaped.
- If the encoded value is not compressed and `codec.encode` returned a `string` (the `jsonCodec` case), `payload` is that string verbatim, no marker — identical to today's uncompressed path.

Decoding strips the codec marker first. If the stored value isn't tagged for the _configured_ codec, it's decoded with `jsonCodec()` as a fallback — this is what makes switching a cache's `codec` option safe for entries already written under the old codec (mirrors how mixing compression settings already works today).

## Non-goals (deferred, follow-up issues)

- Snowflake packing codec transform.
- `project` (per-entity projection) for the Redis and in-memory caches.
- Benchmark script comparing JSON/JSON+gzip/msgpack/msgpack+snowflake-packing on real payloads.

## Testing

Extend `packages/plugin-cache/tests/redis.test.ts` (using the existing `FakeRedis` fixture):

1. Round-trip through `jsonCodec()` (default) — existing behavior unchanged.
2. Round-trip through `msgpackCodec()`, including a `bigint` field and a nested object, uncompressed and compressed (forcing `compressionThreshold: 0`).
3. A cache configured with `msgpackCodec()` still reads a value written earlier by the default `jsonCodec()` (the migration-safety guarantee above).
4. `createRedisCache({ codec })` threads the option to every entity cache.

## Consumer of this work

`@wolfstar/plugin-broker` (issue #136) imports `CacheCodec`/`jsonCodec` from this package's public exports as a workspace dependency, rather than defining its own codec type — implemented in a separate worktree/branch stacked on top of this one.
