<div align="center">

<img src="https://cdn.wolfstar.rocks/wolfstar-assets/wolfstar.png" alt="WolfStar" width="100" />

# @wolfstar/plugin-cache

**A storage-agnostic Discord entity cache, in memory or in Redis.**

[![version](https://npmx.dev/api/registry/badge/version/@wolfstar/plugin-cache)](https://npmx.dev/package/@wolfstar/plugin-cache)
[![downloads](https://npmx.dev/api/registry/badge/downloads/@wolfstar/plugin-cache)](https://npmx.dev/package/@wolfstar/plugin-cache)
[![license](https://img.shields.io/github/license/wolfstar-project/plugins?style=flat-square&color=informational)](https://github.com/wolfstar-project/plugins/blob/main/LICENSE)

</div>

## Description

The cache behind [`@wolfstar/plugin-gateway`](../plugin-gateway)'s managers, specified in
[wolfstar-project/plugins#55](https://github.com/wolfstar-project/plugins/issues/55).

A `Cache` is one Map-like `EntityCache` per Discord entity kind (`guilds`, `users`, `channels`,
`messages`, `members`, `roles`, ...) and nothing else. It stores **raw, JSON-serializable API data
only**: building `Structure`s on top of it is the managers' job, which is what lets the same data
live in a `Map` or in Redis.

Swapping the store never changes the call sites:

| Store                 | Backed by | Extras                                               |
| --------------------- | --------- | ---------------------------------------------------- |
| `createInMemoryCache` | `Map`s    | Optional LRU bound, global or per entity             |
| `createRedisCache`    | Redis     | Per-entity TTL, optional gzip or brotli compression  |
| your own              | anything  | Implement `Cache`, every method may return a promise |

## Installation

```bash
pnpm add @wolfstar/plugin-cache
```

## Usage

Most of the time the cache is handed to a `GatewayClient`, which writes every dispatch into it:

```ts
import { createInMemoryCache } from "@wolfstar/plugin-cache";
import { GatewayClient } from "@wolfstar/plugin-gateway";

const client = new GatewayClient({
  intents: GatewayIntentBits.Guilds | GatewayIntentBits.GuildMessages,
  // Keep at most 1000 messages, every other entity cache is unbounded.
  cache: createInMemoryCache({ maxSize: { messages: 1_000 } }),
});
```

It can also be used on its own, with any gateway dispatch source:

```ts
import { attachCacheToGateway, createInMemoryCache } from "@wolfstar/plugin-cache";

const cache = createInMemoryCache();
const detach = attachCacheToGateway(gateway, cache, {
  onError: (error) => console.error(error),
});

const guild = await cache.guilds.get(guildId);
```

`applyGatewayDispatch` also takes care of the cascades: a `CHANNEL_DELETE` drops that channel's
messages, a `GUILD_DELETE` drops every entity of that guild, and so on. It only relies on the
`Cache` interface, so custom stores get them for free.

Reactions and poll votes update the cached message: counts, `me`, and `me_voted`. Their dispatches
only carry the voter's ID, so pass the bot's user ID for the `me` flags:

```ts
await applyGatewayDispatch(cache, payload, { clientUserId: botId });
```

A reaction or vote on a message the cache does not hold is ignored, since there is nothing to count
it into.

### Redis

`createRedisCache` takes any client exposing the handful of commands it needs (`RedisClientLike`),
which an [`ioredis`](https://github.com/redis/ioredis) `Redis` or `Cluster` instance satisfies as is:

```ts
import { createRedisCache } from "@wolfstar/plugin-cache";
import { Redis } from "ioredis";

const cache = createRedisCache({
  redis: new Redis(process.env.REDIS_URL!),
  prefix: "my-bot:cache",
  compression: "gzip",
  compressionThreshold: 1024,
  ttl: { guilds: 60 * 60, users: 30 * 60 },
});
```

| Option                 | Default            | Description                                                           |
| ---------------------- | ------------------ | --------------------------------------------------------------------- |
| `redis`                | —                  | The client to use.                                                    |
| `prefix`               | `"wolfstar:cache"` | Prefix of every key, entries live at `<prefix>:<entity>:<key>`.       |
| `compression`          | `"none"`           | `"gzip"`, `"brotli"`, or `"none"`.                                    |
| `compressionThreshold` | `1024`             | Minimum serialized size, in bytes, for a value to be compressed.      |
| `ttl`                  | `{}`               | Time-to-live in seconds, per entity cache. Omitted ones never expire. |
| `indexGuilds`          | `true`             | Index guild-scoped entity caches by guild, see below.                 |

Compressed values are tagged, so turning compression on or off never breaks reading the values
already stored. Each entity cache keeps a sorted set index (`<prefix>:<entity>:@index`) used by
`keys`, `entries`, `getSize`, and `clear`. A value and its index entry are written and deleted in
one `MULTI` transaction, and with a `ttl` every write also prunes the expired index entries, so the
index stays bounded even when nothing enumerates it. The client must therefore support `multi()`,
which `ioredis` does.

With `indexGuilds`, the entity caches holding guild data (channels, messages, members, roles, ...)
also keep one sorted set per guild (`<prefix>:<entity>:@guild:<guildId>`). A `GUILD_DELETE` then
reads the guild's keys from it instead of scanning every entry of every entity cache, which on a
large cache means reading and decompressing every stored message. The price is one more index write
per write, and a read before each delete. Entries written while the option was off are not indexed,
so turning it on for a populated cache leaves them behind on `GUILD_DELETE` until they expire or the
cache is cleared. When the transaction exposes `pexpire` (`ioredis` does), the guild indexes of an
entity cache with a `ttl` expire with their entries.

#### Errors

A missing value is not an error: `get` resolves to `undefined`. A value that cannot be read back
(invalid JSON, or compressed bytes that fail to decompress) rejects with a `CacheValueError`
carrying the Redis `key`, and the original error as `cause`. Connection errors are not wrapped, they
propagate as the client throws them. `@wolfstar/plugin-gateway` surfaces both as an `error` event.

### Gateway sessions

`createRedisSessionStore` stores the gateway shards' sessions for `@wolfstar/plugin-gateway`'s
`sessionStore` option, so a restarted process resumes them instead of identifying again (see
[Resuming sessions across restarts](../plugin-gateway#resuming-sessions-across-restarts)). It only
needs `get`, `set`, and `del`, so it can share the cache's client:

```ts
import { createRedisCache, createRedisSessionStore } from "@wolfstar/plugin-cache";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);
const cache = createRedisCache({ redis });
const sessionStore = createRedisSessionStore({ redis, prefix: "my-bot:sessions" });
```

| Option   | Default               | Description                                                                      |
| -------- | --------------------- | -------------------------------------------------------------------------------- |
| `redis`  | —                     | The client to use.                                                               |
| `prefix` | `"wolfstar:sessions"` | Prefix of every key, sessions live at `<prefix>:<shardId>` as JSON.              |
| `ttl`    | `600`                 | Seconds a session is kept after its last write, `null` to keep it until dropped. |

Discord only lets a session be resumed for a while after its connection closes, and does not say
for how long: the `ttl` spares a restart the attempt to resume a session long gone (which costs a
connection before identifying anyway) and keeps Redis tidy. Each write pushes the expiration back,
and the gateway writes on every dispatch, so only a shard receiving no dispatch for longer than the
`ttl` identifies on the next restart. A value that is not valid JSON rejects with a
`CacheValueError`, which the gateway reports before identifying.

The store is a `GatewaySessionStore`, any object with the same two methods works:

```ts
interface GatewaySessionStore {
  get(shardId: number): Awaitable<GatewaySessionInfo | null>;
  // `null` once the session can no longer be resumed.
  set(shardId: number, info: GatewaySessionInfo | null): Awaitable<void>;
}
```

`GatewaySessionInfo` has the same shape as `@discordjs/ws`'s `SessionInfo`, without the package
depending on it.

### Custom stores

```ts
interface EntityCache<Raw> {
  // Optional: `true` when no method ever returns a promise.
  readonly synchronous?: boolean;
  get(key: string): Awaitable<Raw | undefined>;
  set(key: string, value: Raw): Awaitable<void>;
  has(key: string): Awaitable<boolean>;
  delete(key: string): Awaitable<boolean>;
  clear(): Awaitable<void>;
  getSize(): Awaitable<number>;
  keys(): Awaitable<string[]>;
  values(): Awaitable<Raw[]>;
  entries(): Awaitable<[key: string, value: Raw][]>;
  // Optional: `null` when the store does not index its entries by guild.
  deleteGuild?(guildId: string): Awaitable<number | null>;
}
```

`keys`, `values`, and `entries` return snapshots rather than live iterators, which keeps the
semantics identical between synchronous and asynchronous stores. A store implementing `deleteGuild`
lets `applyGatewayDispatch` skip the scans of a `GUILD_DELETE`; without it, or when it resolves to
`null`, the scans run as before.

Since an `Awaitable` cannot be told apart from a promise without calling the method, a store tells
its consumers it never returns one through `synchronous`: the `MemoryEntityCache`s of
`createInMemoryCache` set it to `true`, the `RedisEntityCache`s of `createRedisCache` to `false`
(compressed or not), and a store leaving it out is treated as asynchronous. It is what lets
`@wolfstar/plugin-gateway`'s `cached` accessors read the cache without awaiting it.

### Keys

Entities are keyed by their ID, except the ones scoped to a guild or a channel, which use the
`guildId:id` / `channelId:id` helpers exported by the package (`memberKey`, `messageKey`,
`roleKey`, ...).

## Credits

The dispatch-to-cache table is adapted from
[suneettipirneni's `@discordjs/cache` prototype](https://github.com/suneettipirneni/discord.js/tree/add-cache-package)
(Apache-2.0), itself following [discordjs/discord.js#11426](https://github.com/discordjs/discord.js/issues/11426).
