<div align="center">

<img src="https://cdn.wolfstar.rocks/wolfstar-assets/wolfstar.png" alt="WolfStar" width="100" />

# @wolfstar/plugin-sharder

**Multi-process and multi-machine sharding for `@wolfstar/plugin-gateway`, or any bot.**

[![version](https://npmx.dev/api/registry/badge/version/@wolfstar/plugin-sharder)](https://npmx.dev/package/@wolfstar/plugin-sharder)
[![downloads](https://npmx.dev/api/registry/badge/downloads/@wolfstar/plugin-sharder)](https://npmx.dev/package/@wolfstar/plugin-sharder)
[![license](https://img.shields.io/github/license/wolfstar-project/plugins?style=flat-square&color=informational)](https://github.com/wolfstar-project/plugins/blob/main/LICENSE)

</div>

## Description

A `GatewayClient` connects its gateway shards from a single process. This package spreads them
across processes, cluster workers, worker threads, and machines. It implements the sharder RFC of
discord.js, [discordjs/discord.js#8084](https://github.com/discordjs/discord.js/issues/8084), with
the answers given in its thread, and the two implementations drafted for it,
[discordjs/discord.js#7204](https://github.com/discordjs/discord.js/pull/7204) and
[discordjs/discord.js#8859](https://github.com/discordjs/discord.js/pull/8859). See
[RFC alignment](#rfc-alignment) for how each point maps to this package.

As in the RFC, a **shard** is what the manager spawns (a process, a cluster worker, a worker
thread, or a process on another machine), and it may connect several gateway shards. The manager
talks to each shard through a `ShardChannel`. The package knows nothing about Discord's gateway:
a shard runs any script using `ShardClient`, so it works with `@wolfstar/plugin-gateway`,
`@discordjs/ws`, or another library.

| Piece                | Role                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| `ShardManager`       | Spawns and supervises the shards, paces their identifies, carries their messages                   |
| `ShardChannel`       | The manager's handle on one shard: status, pings, messages, requests, restarts                     |
| `ShardClient`        | The shard's side: signals its status, messages and requests, answers requests                      |
| `ShardManagerProxy`  | Runs shards on another machine for one or several managers, and talks to other proxies             |
| `ChannelStrategy`    | How shards are spawned: `"fork"` (default), `"cluster"`, `"worker"`, `"network"`, or your own      |
| `MessageHandler`     | How packets are serialized: `"json"` (default), `"v8"`, `"raw"`, or your own                       |
| `MessageTransformer` | How serialized packets are transformed, composable: `"gzip"`, `"brotli"`, or your own (encryption) |

## Installation

```bash
pnpm add @wolfstar/plugin-sharder
```

## Usage

The manager and the shards can share one script: `ShardClient.context` is `null` in the manager.

```ts
// bot.ts
import { GatewayClient } from "@wolfstar/plugin-gateway";
import { ShardClient, ShardManager } from "@wolfstar/plugin-sharder";

if (!ShardClient.context) {
  // Discord's recommended shard count, split across one process per CPU core, forking this script.
  const manager = new ShardManager({ spawn: { delay: 0 } });
  manager.on("shardReady", (channel) =>
    console.log(`Shard ${channel.id} (${channel.shards}) is ready`),
  );
  await manager.spawn();
} else {
  const shard = new ShardClient();
  const client = new GatewayClient({
    ...options,
    ...shard.gatewayOptions,
    // Identifies are paced by the manager across every process, so the spawn delay can be 0.
    gateway: { buildIdentifyThrottler: () => shard.identifyThrottler },
  });
  // Reuse the manager's GET /gateway/bot rather than requesting it again from every process.
  client.gateway.fetchGatewayInformation = () => shard.fetchGatewayInformation();

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
}
```

### Layout

| Option              | Meaning                                                                                        |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| `shards: 9`         | 9 shards of one gateway shard each                                                             |
| `shards: [3, 3, 3]` | 3 shards of 3 gateway shards each: 0-2, 3-5, 6-8                                               |
| `shards: "auto"`    | (default) the gateway shards split across `clusters` shards (default: one per CPU core)        |
| `totalShards`       | the total across every manager; `"auto"` is Discord's recommendation (`recommended` rounds it) |
| `shardList`         | the gateway shards this manager runs, when several managers split them                         |

`"auto"` needs the bot token (`token`, or `DISCORD_TOKEN`) or `gatewayInformation.fetch`. The
manager fetches `GET /gateway/bot` once and caches it for `gatewayInformation.ttl`, keeping its
session start limit up to date with the identifies it grants, and hands it to the shards
(`shard.fetchGatewayInformation()`). A `token` given to the manager is passed to the shards as
`DISCORD_TOKEN`.

### Messages and requests

Messages are raw data, and a request is a message waiting for a reply:

| From a shard                     | From the manager                 | Goes to                          |
| -------------------------------- | -------------------------------- | -------------------------------- |
| `shard.send(body)`               | —                                | the manager's `message` event    |
| `shard.send(body, 2)`            | `manager.send(2, body)`          | shard 2's `message` event        |
| `shard.send(body, "all")`        | `manager.broadcast(body)`        | every shard                      |
| `shard.request(body)`            | —                                | the manager's request handler    |
| `shard.request(body, { to: 2 })` | `manager.request(2, body)`       | shard 2's request handler        |
| `shard.broadcastRequest(body)`   | `manager.broadcastRequest(body)` | every shard, replies by shard ID |

`broadcastRequest` replaces discord.js's `broadcastEval` and `fetchClientValues`. With
`{ partial: true }` it resolves with the outcome of every shard, like `Promise.allSettled`, so the
replies that came before a timeout or a failure are kept.

A request rejects with a `ShardRequestTimeoutError` past its timeout (the manager's
`requestTimeout`, by default the ping timeout), and with the reason of its `signal` when aborted.
Either way the other side is told, and the `signal` of its handler aborts, e.g. to cancel an HTTP
request. A request aborted while it waits for a shard to be ready never leaves the queue. A
throwing or missing handler rejects the request with a `ShardRequestError` carrying the remote
error's name and message.

A message or request for a shard that is not ready waits for it, within its timeout. With
`spawn.readyHint` (or, without it, the average time the shards took so far), a request for a
starting shard that is not expected to be ready before its timeout fails right away, and a shard
slower than the estimate is emitted as `shardSlowStart`.

The sharder has no command format and no `eval`, as the RFC settled. `createCommandHandler` and
`command` are an optional, typed layer on top:

```ts
const commands = { guildCount: () => guilds.size, guild: (id: string) => guilds.has(id) };
shard.setRequestHandler(createCommandHandler(commands));

const counts = await manager.broadcastRequest<CommandReply<typeof commands, "guildCount">>(
  command<typeof commands>("guildCount"),
);
```

### `Result<T, E>`

Every operation that can fail has a `try*` twin resolving with a `Result` of
[`@sapphire/result`](https://www.npmjs.com/package/@sapphire/result) (re-exported as `Result`)
rather than rejecting, as suggested in the RFC thread: `trySend`, `tryRequest`, and
`tryBroadcastRequest` on the manager, channels, and shards, and `tryControl` on shards. The error is
a `ShardError`. `tryBroadcastRequest` resolves with one `Result` per shard. A request handler may
return a `Result` as well: `Ok` is the reply, and `Err` the error the requester gets.

```ts
shard.setRequestHandler((id: string) =>
  guilds.has(id) ? Result.ok(guilds.get(id)) : Result.err(new RangeError("Unknown guild")),
);

const guild = await manager.tryRequest(0, guildId);
guild.match({ ok: (value) => console.log(value), err: (error) => console.error(error.message) });
const counts = await manager.tryBroadcastRequest<number>({ type: "guildCount" });
const total = counts.reduce((sum, count) => sum + count.unwrapOr(0), 0);
```

### Lifecycle and supervision

A shard signals its status, and the manager emits it:

| Status         | Set by                            | When the process stops              |
| -------------- | --------------------------------- | ----------------------------------- |
| `Starting`     | `new ShardClient()`               | restarted, if the supervisor allows |
| `Ready`        | `shard.ready()`                   | restarted, if the supervisor allows |
| `Disconnected` | `shard.disconnected()`            | restarted, if the supervisor allows |
| `Reconnecting` | `shard.reconnecting()`            | restarted, if the supervisor allows |
| `Exiting`      | `shard.exit()`                    | not restarted                       |
| `Restarting`   | `shard.restart()`                 | restarted, always                   |
| `Idle`         | the manager, when no process runs | —                                   |

Crashes go through a supervisor modelled on Erlang/OTP's: a shard crashing more than
`supervisor.intensity` times within `supervisor.period` milliseconds is given up on and emitted as
`shardGiveUp` (with `period: 0`, the default, the crashes are counted in a row until the shard is
ready again, and `intensity: -1`, the default, never gives up). `supervisor.strategy` picks what
else restarts: `"one-for-one"` (the default), `"one-for-all"`, or `"rest-for-one"`. A shard that
fails before it is ready (the RFC's `error` signal) is emitted as `shardError` with a
`ShardSpawnError`.

Shards start one at a time, `spawn.delay` apart. One that is not ready within `spawn.timeout` is
killed and tried again at the end of the queue. The manager pings every ready shard each
`ping.interval` (`delaySinceReceived` counts from the last answer instead); one that stops
answering for `ping.timeout` is emitted as `shardUnresponsive`, or restarted when nothing listens.
`channel.ping` has the latency and the timestamps.

`manager.restart(id)` and `manager.destroy()` first ask the shard to close, which runs its close
handler, and kill it past the timeout. `manager.restart(id, { rolling: true })` spawns the new shard
first and closes the old one once the new one is ready, for close to no downtime;
`manager.reshard(layout)` does the same for a whole new layout. When the manager dies, a process
shard emits `disconnect` and exits when nothing listens to it; a worker thread stops with it.

### Gateway shards

The manager paces identifies across every process: `shard.identifyThrottler` is `@discordjs/ws`'s
`IIdentifyThrottler`, and the manager grants one identify per `max_concurrency` bucket every
`identify.delay` (5 seconds). Within a shard, `setShardHandler({ start, close })` lets the manager
start and close single gateway shards (`manager.startShard(id)`, `closeShard`, `restartShard`), and
`shard.control()` asks the manager to start, close, or restart shards or gateway shards:

```ts
shard.setShardHandler({ start: (id) => connect(id), close: (id) => disconnect(id) });
await shard.control({ action: "restart", target: { shard: 12 } });
await shard.control({ action: "restart", target: { channel: "all" } });
```

### Strategies

| Strategy                  | Shards are                        | Notes                                                                      |
| ------------------------- | --------------------------------- | -------------------------------------------------------------------------- |
| `ForkStrategy` (`"fork"`) | child processes                   | The default. Ports must differ per shard. Defaults to the manager's script |
| `ClusterStrategy`         | `node:cluster` workers            | Ports are shared and balanced. Defaults to the manager's script            |
| `WorkerStrategy`          | worker threads                    | Fastest messages, but one crash of the process stops every shard           |
| `NetworkStrategy`         | processes of `ShardManagerProxy`s | Other machines, over TLS (or plain TCP on trusted networks)                |

A strategy can be given by name, built with `strategyOptions`, and custom ones are registered with
`registerStrategy`. `channel.pid`, `channel.threadId`, and `channel.host` identify each shard.

### Several machines

The manager listens with a `NetworkStrategy`, and a `ShardManagerProxy` on each machine connects to
it, spawns the shards it is given with its own strategy, and carries their messages:

```ts
// On the manager's machine.
const manager = new ShardManager({
  strategy: new NetworkStrategy({
    port: 7000,
    token: process.env.SHARDER_TOKEN!,
    tls: { key, cert },
  }),
  totalShards: "auto",
  clusters: 16,
});
await manager.spawn();

// On every other machine.
const proxy = new ShardManagerProxy({
  managers: ["manager.internal:7000", "manager-backup.internal:7000"],
  token: process.env.SHARDER_TOKEN!,
  tls: { ca },
  capacity: 8,
  strategy: new ForkStrategy({ path: "./bot.js" }),
});
await proxy.connect();
```

Spawns go to the connected proxy with the most room, as the proxies report it, and wait when every
proxy is full or none is connected. A proxy losing a manager keeps its shards (`managerLoss:
"keep"`, the default, or `"exit"`) and reconnects; back within the manager's `reconnectGrace`, it
keeps its shards, and past it they are spawned elsewhere and its stale ones killed. Proxies coming
back are not rebalanced: they take the next spawns.

A proxy serves its managers in one of two modes:

- `mode: "failover"` (the default): one manager at a time, the first reachable of `managers`,
  failing over to the next ones when it loses it, e.g. a primary and a standby manager.
- `mode: "all"`: every manager of `managers` at once, sharing its `capacity` between them, e.g.
  managers each running part of the gateway shards (`shardList`). Each manager can have its own
  `token` and `tls`, and gets its own `id` (`NetworkStrategy`'s `id` option), which keeps the
  shards of different managers apart.

Messages and requests between two shards of the same manager and the same proxy never go through
the manager. With `peer`, proxies also talk to each other: each listens for peer connections, the
manager tells every proxy which proxy runs which ready shard, and the messages and requests between
shards of different proxies go from one proxy to the other directly. The first one to a new proxy
goes through the manager while the peer connection opens; a packet for a shard that moved or is not
ready is sent back and goes through the manager; a peer connection lost fails the requests waiting
on it right away.

```ts
const proxy = new ShardManagerProxy({
  managers: ["north.internal:7000", "south.internal:7000"],
  mode: "all",
  token: process.env.SHARDER_TOKEN!,
  capacity: 16,
  strategy: new ForkStrategy({ path: "./bot.js" }),
  peer: { port: 7001, advertise: "den.internal", tls: { key, cert }, connectTls: { ca } },
});
```

### Serialization and transformers

The manager tells its shards the names of its message handler and transformers, and they build the
same ones from the registry: custom ones must be registered on both sides, with
`registerMessageHandler` / `registerMessageTransformer` (or `ShardClient.registerMessageHandler` /
`ShardClient.registerMessageTransformer`, as in the RFC). Transformers write in their order and read
in the reverse one, so `["gzip", "aes"]` compresses then encrypts; they are async, and get the
channel they work for. `"v8"` keeps `Map`s, `Set`s, `Date`s, `BigInt`s, and typed arrays, which
JSON loses; `"raw"` passes values as they are to channels that clone them (worker threads, process
IPC), without transformers or the network.

```ts
ShardClient.registerMessageTransformer("aes", () => new AesTransformer(process.env.SHARDER_KEY!));
const manager = new ShardManager({ messageHandler: "v8", transformers: ["gzip", "aes"] });
```

## RFC alignment

| Source         | Point                                                                   | Here                                                                                  |
| -------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| RFC            | `ShardManager` with a strategy, by instance or name                     | `strategy` (instance or name) and `registerStrategy`                                  |
| RFC            | Worker, Fork (default), Cluster, Network strategies                     | `WorkerStrategy`, `ForkStrategy`, `ClusterStrategy`, `NetworkStrategy`                |
| RFC            | Manager configures the clients through the environment                  | `ShardContext` in `WOLFSTAR_SHARDER` (or worker data), `DISCORD_TOKEN`                |
| RFC            | Lifecycle events, invalid messages printed when unhandled               | `shardCreate` … `shardInvalidMessage`, `console.error` fallbacks                      |
| RFC            | Missing pings restart the shard when unhandled                          | `shardUnresponsive`, restart without listeners                                        |
| RFC            | Requests time out within the ping timeout, globally or per request      | `requestTimeout` (defaults to `ping.timeout`), `timeout` per request                  |
| RFC            | `ShardClient` signals: Starting, Ready, Exit, Restarting                | `ShardStatus` (plus #7204's `Disconnected` and `Reconnecting`)                        |
| RFC            | `registerMessageHandler` / `registerMessageTransformer`                 | `ShardClient.register*` and the module-level registries                               |
| RFC            | JSON and V8 message handlers                                            | `JsonMessageHandler`, `V8MessageHandler` (plus #7204's `RawMessageHandler`)           |
| RFC            | Composable transformers, reverse order when reading, Gzip and Brotli    | `MessageTransformer` with its channel context, `GzipTransformer`, `BrotliTransformer` |
| RFC            | `ShardManagerProxy` over an encrypted network, local routing            | `ShardManagerProxy`, TLS, messages between its shards routed locally                  |
| RFC answers    | Raw data, no `eval`; opt-in replies with timeouts; async transformers   | Messages vs requests, `RequestOptions`, async `write`/`read`                          |
| RFC answers    | Cancel requests, dequeue them, `AbortController` in shards              | `signal`, dropped from the ready queue, `signal` in handlers                          |
| RFC answers    | Partial results of aborted broadcasts                                   | `broadcastRequest(body, { partial: true })`                                           |
| RFC answers    | Enqueue messages for shards not ready, with a ready-time hint           | `waitForReady`, `spawn.readyHint` (or measured), early failure, `shardSlowStart`      |
| RFC answers    | `error` signal when a shard fails before ready                          | `shardError` with `ShardSpawnError`                                                   |
| RFC answers    | Configurable restart limits, alerts, Erlang supervisors                 | `supervisor` intensity, period, strategy; `shardGiveUp`                               |
| RFC answers    | Manager death: configurable, default die                                | `disconnect` event, exit without listeners; proxy `managerLoss`                       |
| RFC answers    | Proxies: capacity, queue when full, failover managers, no rebalancing   | `capacity` with `Load` reports, pending spawns, `managers` list, `reconnectGrace`     |
| RFC answers    | `Result<T, E>` instead of `try`/`catch`                                 | `try*` methods, handlers returning a `Result`, `ShardError`                           |
| RFC answers    | Proxies with several managers                                           | `mode: "failover"` or `mode: "all"`, per-manager `token`, `tls`, and `id`             |
| RFC            | Proxies routing to shards they host, and to other proxies (P2P)         | Local routing, `peer` connections, the manager's directory of ready shards            |
| RFC answers    | Optional built-in command layer                                         | `createCommandHandler`, `command`                                                     |
| RFC answers    | Identify processes and threads for observability                        | `channel.pid`, `threadId`, `host`; worker threads named `shard <id>`                  |
| #7204          | `totalShards`, `shardList`, `clusters` (CPU count), `"auto"`            | Layout options                                                                        |
| #7204          | Respawn budget that resets on ready                                     | `supervisor` with `period: 0`                                                         |
| #7204          | Fetch `/gateway/bot` once in the manager and share it                   | `gatewayInformation`, `shard.fetchGatewayInformation()`                               |
| #7204          | `fetchRecommendedShards` with `guildsPerShard` and `multipleOf`         | `fetchRecommendedShardCount`, `recommended`                                           |
| #7204          | Ping with `delaySinceReceived`                                          | `ping.delaySinceReceived`                                                             |
| #7204 / #8859  | Restart all shards, spawn delay after ready, spawn timeout then requeue | `restartAll`, `spawn.delay`, `spawn.timeout`                                          |
| #8859          | Manager-side "channel" to each shard                                    | `ShardChannel`, `manager.channels`                                                    |
| #8859          | Start, close, restart single gateway shards, from the manager or shards | `setShardHandler`, `startShard` & co., `shard.control()`                              |
| #8859          | Strategies with `init` and `destroy`                                    | `ChannelStrategy.init` / `destroy`                                                    |
| #7204 comments | Cross-process identify pacing, minimal-downtime restarts and resharding | `identifyThrottler`, `restart(id, { rolling })`, `reshard()`                          |
