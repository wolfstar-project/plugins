<div align="center">

<img src="https://cdn.wolfstar.rocks/wolfstar-assets/wolfstar.png" alt="WolfStar" width="100" />

# @wolfstar/plugin-sharder

**Multi-process sharding for `@wolfstar/plugin-gateway`, or any bot.**

[![version](https://npmx.dev/api/registry/badge/version/@wolfstar/plugin-sharder)](https://npmx.dev/package/@wolfstar/plugin-sharder)
[![downloads](https://npmx.dev/api/registry/badge/downloads/@wolfstar/plugin-sharder)](https://npmx.dev/package/@wolfstar/plugin-sharder)
[![license](https://img.shields.io/github/license/wolfstar-project/plugins?style=flat-square&color=informational)](https://github.com/wolfstar-project/plugins/blob/main/LICENSE)

</div>

## Description

A `GatewayClient` connects its gateway shards from a single process. This package spreads them
across processes, cluster workers, or worker threads. It follows the sharder RFC of discord.js,
[discordjs/discord.js#8084](https://github.com/discordjs/discord.js/issues/8084), and its draft
implementation, [discordjs/discord.js#8859](https://github.com/discordjs/discord.js/pull/8859).

As in the RFC, a **shard** is what the manager spawns (a process, a cluster worker, or a worker
thread), and it may connect several gateway shards. The package knows nothing about Discord: a
shard runs any script using `ShardClient`, so it works with `@wolfstar/plugin-gateway`,
`@discordjs/ws`, or another library.

| Piece                | Role                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| `ShardManager`       | Spawns the shards one at a time, respawns them, pings them, carries their messages              |
| `ShardClient`        | The shard's side: signals its status, sends messages and requests, answers requests             |
| `ChannelStrategy`    | How shards are spawned: `ForkStrategy`, `ClusterStrategy`, `WorkerStrategy`, or your own        |
| `MessageHandler`     | How packets are serialized: `JsonMessageHandler` (default) or `V8MessageHandler`                |
| `MessageTransformer` | How serialized packets are transformed, composable: `GzipTransformer`, `BrotliTransformer`, ... |

## Installation

```bash
pnpm add @wolfstar/plugin-sharder
```

## Usage

The manager is a small script of its own:

```ts
// manager.ts
import { ForkStrategy, ShardManager, fetchRecommendedShardCount } from "@wolfstar/plugin-sharder";

const shardCount = await fetchRecommendedShardCount(process.env.DISCORD_TOKEN!, { multipleOf: 4 });
const manager = new ShardManager({
  strategy: new ForkStrategy({ path: new URL("./bot.js", import.meta.url) }),
  // 4 gateway shards per process.
  shards: Array.from({ length: shardCount / 4 }, () => 4),
});

manager.on("shardReady", (shard) => console.log(`Shard ${shard.id} (${shard.shards}) is ready`));
await manager.spawn();
```

Each shard hands its gateway shards to its `GatewayClient`, and tells the manager once it is ready,
so the manager spawns the next one only then:

```ts
// bot.ts
import { GatewayClient } from "@wolfstar/plugin-gateway";
import { ShardClient } from "@wolfstar/plugin-sharder";

const shard = new ShardClient();
const client = new GatewayClient({ ...options, ...shard.gatewayOptions });

const guilds = new Set<string>();
client.on("guildCreate", (guild) => guilds.add(guild.id));
client.on("guildDelete", (_guild, data) => guilds.delete(data.id));

shard.setRequestHandler((body: { type: string }) => {
  if (body.type === "guildCount") return guilds.size;
  throw new Error(`Unknown request ${body.type}`);
});
shard.setCloseHandler(() => client.destroy());

let pending = shard.shards.length;
client.on("shardReady", () => {
  if (--pending === 0) void shard.ready();
});
await client.connect();
```

### Messages and requests

Messages are raw data: the package enforces no command format, and has no `eval`. A message
expects no answer, a request waits for a reply:

| From a shard                     | From the manager                 | Goes to                       |
| -------------------------------- | -------------------------------- | ----------------------------- |
| `shard.send(body)`               | —                                | the manager's `message` event |
| `shard.send(body, 2)`            | `manager.send(2, body)`          | shard 2's `message` event     |
| `shard.send(body, "all")`        | `manager.broadcast(body)`        | every shard                   |
| `shard.request(body)`            | —                                | the manager's request handler |
| `shard.request(body, { to: 2 })` | `manager.request(2, body)`       | shard 2's request handler     |
| `shard.broadcastRequest(body)`   | `manager.broadcastRequest(body)` | every shard, replies by ID    |

`broadcastRequest` replaces discord.js's `broadcastEval` and `fetchClientValues`:

```ts
const counts = await shard.broadcastRequest<number>({ type: "guildCount" });
const total = counts.reduce((sum, count) => sum + count, 0);
```

A request rejects with a `ShardRequestTimeoutError` when no reply comes within its timeout (the
manager's `requestTimeout` by default), and with the reason of its `signal` when aborted. Either way
the other side is told, and the `signal` of its handler aborts. A throwing handler, or a missing
one, rejects the request with a `ShardRequestError` carrying the remote error's name and message.
A message or request for a shard that is not ready yet waits for it, within the timeout.

### Lifecycle

A shard signals its status, and the manager emits it:

| Status       | Set by                                 | On exit                      |
| ------------ | -------------------------------------- | ---------------------------- |
| `Starting`   | `new ShardClient()`                    | respawned, within `respawns` |
| `Ready`      | `shard.ready()`                        | respawned, within `respawns` |
| `Exiting`    | `shard.exit()`                         | not respawned                |
| `Restarting` | `shard.restart()`                      | respawned, always            |
| `Idle`       | the manager, when the shard is stopped | —                            |

`respawns` counts the crashes in a row, and resets once the shard is ready again (`-1`, the
default, respawns forever). A shard not ready within `spawn.timeout` is killed and tried again at
the end of the queue. Shards start one at a time, `spawn.delay` apart, since Discord allows one
gateway identify per 5 seconds across every process.

The shards ping the manager every `ping.interval`. A ready shard silent for `ping.timeout` is
emitted as `shardUnresponsive`, or restarted when nothing listens to it. `manager.restart(id)` and
`manager.destroy()` first ask the shard to close, which runs its close handler, and kill it past the
timeout. When the manager dies, a shard spawned as a process emits `disconnect`, and exits when
nothing listens to it.

| Event                 | Arguments       |
| --------------------- | --------------- |
| `shardCreate`         | `shard`         |
| `shardStatus`         | `shard, status` |
| `shardReady`          | `shard`         |
| `shardPing`           | `shard, delay`  |
| `shardUnresponsive`   | `shard`         |
| `shardRestart`        | `shard`         |
| `shardExit`           | `shard, code`   |
| `shardDestroy`        | `shard`         |
| `shardInvalidMessage` | `shard, error`  |
| `message`             | `body, shard`   |
| `error`               | `error`         |

### Strategies

| Strategy          | Shards are          | Notes                                                                |
| ----------------- | ------------------- | -------------------------------------------------------------------- |
| `ForkStrategy`    | child processes     | The manager can be a script of its own. Ports must differ per shard. |
| `ClusterStrategy` | `node:cluster` ones | Ports are shared and balanced. Defaults to the manager's own script. |
| `WorkerStrategy`  | worker threads      | Fastest messages, but one crash of the process stops every shard.    |

A custom `ChannelStrategy` spawns shards anywhere (a container, another machine) as long as the
shard's side gets a matching `ClientTransport`, passed to `new ShardClient({ transport, context })`.

### Serialization and transformers

The manager and its shards must be given the same `messageHandler` and `transformers`, in the same
order. Transformers write in their order and read in the reverse one, so `[gzip, encrypt]`
compresses then encrypts:

```ts
const options = { messageHandler: new V8MessageHandler(), transformers: [new GzipTransformer()] };
const manager = new ShardManager({ ...options, strategy, shards: 8 });
// In the shard:
const shard = new ShardClient(options);
```

`V8MessageHandler` keeps `Map`s, `Set`s, `Date`s, `BigInt`s, and typed arrays, which JSON loses.

## Limitations

- There is no `ShardManagerProxy` yet: the RFC's cross-machine layer. A custom `ChannelStrategy`
  covers the transport, but the manager stays a single process.
- Shards share no cache on their own: give every `GatewayClient` the same Redis cache
  (`createRedisCache` from `@wolfstar/plugin-cache`) to read entities of other shards.
