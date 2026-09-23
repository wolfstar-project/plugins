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
import { WebSocketShardEvents } from "@discordjs/ws";
import { applyGatewayDispatch, createInMemoryCache } from "@wolfstar/plugin-cache";

const cache = createInMemoryCache();
gateway.on(WebSocketShardEvents.Dispatch, (payload) => applyGatewayDispatch(cache, payload));

const guild = await cache.guilds.get(guildId);
```

`applyGatewayDispatch` also takes care of the cascades: a `CHANNEL_DELETE` drops that channel's
messages, a `GUILD_DELETE` drops every entity of that guild, and so on. It only relies on the
`Cache` interface, so custom stores get them for free.

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

Compressed values are tagged, so turning compression on or off never breaks reading the values
already stored. Each entity cache keeps a sorted set index (`<prefix>:<entity>:@index`) used by
`keys`, `entries`, `getSize`, and `clear`.

### Custom stores

```ts
interface EntityCache<Raw> {
  get(key: string): Awaitable<Raw | undefined>;
  set(key: string, value: Raw): Awaitable<void>;
  has(key: string): Awaitable<boolean>;
  delete(key: string): Awaitable<boolean>;
  clear(): Awaitable<void>;
  getSize(): Awaitable<number>;
  keys(): Awaitable<string[]>;
  values(): Awaitable<Raw[]>;
  entries(): Awaitable<[key: string, value: Raw][]>;
}
```

`keys`, `values`, and `entries` return snapshots rather than live iterators, which keeps the
semantics identical between synchronous and asynchronous stores.

### Keys

Entities are keyed by their ID, except the ones scoped to a guild or a channel, which use the
`guildId:id` / `channelId:id` helpers exported by the package (`memberKey`, `messageKey`,
`roleKey`, ...).

## Credits

The dispatch-to-cache table is adapted from
[suneettipirneni's `@discordjs/cache` prototype](https://github.com/suneettipirneni/discord.js/tree/add-cache-package)
(Apache-2.0), itself following [discordjs/discord.js#11426](https://github.com/discordjs/discord.js/issues/11426).
