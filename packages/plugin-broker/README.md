<div align="center">

<img src="https://cdn.wolfstar.rocks/wolfstar-assets/wolfstar.png" alt="WolfStar" width="100" />

# @wolfstar/plugin-broker

**Distribute gateway events across processes over Redis Streams, with at-least-once delivery.**

[![version](https://npmx.dev/api/registry/badge/version/@wolfstar/plugin-broker)](https://npmx.dev/package/@wolfstar/plugin-broker)
[![downloads](https://npmx.dev/api/registry/badge/downloads/@wolfstar/plugin-broker)](https://npmx.dev/package/@wolfstar/plugin-broker)
[![license](https://img.shields.io/github/license/wolfstar-project/plugins?style=flat-square&color=informational)](https://github.com/wolfstar-project/plugins/blob/main/LICENSE)

</div>

## Description

A plugin for [`@wolfstar/http-framework`](https://www.npmjs.com/package/@wolfstar/http-framework)
that publishes and consumes messages over [Redis Streams](https://redis.io/docs/latest/develop/data-types/streams/),
with consumer-group semantics: one gateway process (or a set of sharded ones, see
[`@wolfstar/plugin-sharder`](https://www.npmjs.com/package/@wolfstar/plugin-sharder)) can publish
dispatches for any number of worker processes to consume, sharing the load, without dropping the
gateway connection when a worker restarts, crashes, or deploys.

Unlike Redis Pub/Sub, entries survive a worker being down (`XADD`/`XREADGROUP` instead of `PUBLISH`),
and unlike a naive `XREAD` without a consumer group, workers share the load instead of every worker
receiving every message. A listener that throws leaves its entry pending: it is redelivered the next
time a consumer of the same name starts.

## Installation

```bash
pnpm add @wolfstar/plugin-broker
```

## Usage

### Producer

```ts
import { createBroker } from "@wolfstar/plugin-broker";
import { Redis } from "ioredis";

const broker = createBroker({
  redis: new Redis(process.env.REDIS_URL!),
  stream: "wolfstar:events",
  maxLength: 100_000, // XADD MAXLEN ~, omit for no trimming
});

await broker.publish("messageCreate", payload);
```

### Consumer

#### Stars module

On framework 6.1 and later, list the module in `modules` in `stars.config` (needs the optional
`@wolfstar/kit` peer):

```ts
// stars.config.ts
export default defineConfig({
  modules: [["@wolfstar/plugin-broker/module", { stream: "wolfstar:events", group: "workers" }]],
});
```

The options are written into the built entry, so they must be JSON-serialisable. `redis` is a client
instance and `consumer` is per-process (for example `worker-${process.pid}`), so neither can live in
`stars.config`: supply both through `ClientOptions.broker`, which is shallow-merged over the module
options (the module `options` are the base values, `ClientOptions.broker` overrides them). TypeScript
currently types `ClientOptions.broker` as the full `BrokerConsumerOptions`, so `redis`, `stream`, `group`
and `consumer` must all be present there, even when `stream` and `group` are also set in `stars.config`:

```ts
import { Client } from "@wolfstar/http-framework";
import { Redis } from "ioredis";

const client = new Client({
  broker: {
    redis: new Redis(process.env.REDIS_URL!),
    stream: "wolfstar:events",
    group: "workers",
    consumer: `worker-${process.pid}`,
  },
});
```

A missing `redis` or `consumer` is not reported when the client is constructed: it surfaces when the
consumer starts, once the client starts listening (`postListen`). Never combine the module (or the
`@wolfstar/plugin-broker/plugin` factory below) with `import "@wolfstar/plugin-broker/register"`: both
paths install the same hooks, so combining them installs them twice.

Without Stars, pass the `definePlugin` factory to `plugins` instead:

```ts
import brokerPlugin from "@wolfstar/plugin-broker/plugin";

const client = new Client({
  plugins: [brokerPlugin({ redis, stream: "wolfstar:events", group: "workers", consumer: "w1" })],
});
```

The consumer is started once the client starts listening, exactly as with `register`.

#### `register` entrypoint (framework v3/v5/v6)

Import the side-effecting `register` entrypoint **before** you create your `Client`, then configure
`broker` on it — it is started automatically once the client starts listening:

```ts
import "@wolfstar/plugin-broker/register";
import { Client } from "@wolfstar/http-framework";
import { Redis } from "ioredis";

const client = new Client({
  broker: {
    redis: new Redis(process.env.REDIS_URL!),
    stream: "wolfstar:events",
    group: "workers", // XGROUP CREATE ... MKSTREAM on start
    consumer: `worker-${process.pid}`, // a name stable across restarts of *this* replica
    batchSize: 10, // COUNT, default 10
    block: 5_000, // BLOCK ms, default 5000
    claimIdle: 60_000, // XAUTOCLAIM entries idle longer than this, from any consumer
    maxDeliveries: 5, // after that, move to the dead-letter stream instead of retrying forever
    deadLetterStream: "wolfstar:events:dead", // default `${stream}:dead`
    shutdownSignals: ["SIGTERM", "SIGINT"], // stop gracefully on these signals
  },
});
```

### Delivery guarantees

An entry is acknowledged once every listener for its event has resolved. A listener that throws
leaves it pending, and it is delivered again:

- to a restarted consumer of the same name, which reads its own pending entries first;
- with `claimIdle` set, to whichever consumer claims (`XAUTOCLAIM`) it once it has been idle that
  long — including one left behind by a replica that crashed and never came back under the same
  name, and the consumer's own failed entries, which are then retried in-process.

Idle time counts from an entry's last delivery, so an entry whose listeners are still running after
`claimIdle` can be claimed and handled again by another consumer at the same time. Set `claimIdle`
well above your slowest listener's run time, not just above how fast a crash should be noticed.

With `maxDeliveries` set, an entry delivered more than that many times (a count Redis keeps across
consumers and restarts) is moved to the dead-letter stream instead: it keeps its `event` and
`payload` fields, plus the original `id`, `stream`, `group`, `consumer`, and `deliveries`. Without
it, a failing entry is retried forever. An entry trimmed by `maxLength` while pending is acknowledged
and skipped.

### Graceful shutdown

`container.broker.stop()` stops reading and awaits the in-flight entry before returning; anything
left unacknowledged stays pending for the next consumer. With `shutdownSignals`, the consumer does so
on its own when the process receives one of them, then raises the signal again if nothing else
listens to it, so the process still terminates. If you handle the signal yourself (e.g. to also
destroy a `GatewayClient`), exiting is left to your handler.

### Forwarding gateway dispatches

`forwardGatewayDispatches` publishes every dispatch a
[`@wolfstar/plugin-gateway`](https://www.npmjs.com/package/@wolfstar/plugin-gateway) `GatewayClient`
receives, under its type (e.g. `MESSAGE_CREATE`) with its data as payload. It forwards them on the
client's `dispatch` event, once they are written to the client's cache, so workers sharing a
[`@wolfstar/plugin-cache`](https://www.npmjs.com/package/@wolfstar/plugin-cache) Redis cache see the
state each dispatch left when they receive it:

```ts
import { createBroker, forwardGatewayDispatches } from "@wolfstar/plugin-broker";
import {
  GatewayDispatchEvents,
  type GatewayMessageCreateDispatchData,
} from "discord-api-types/v10";

declare module "@wolfstar/plugin-broker" {
  interface BrokerEvents {
    MESSAGE_CREATE: GatewayMessageCreateDispatchData;
  }
}

const broker = createBroker({ redis, stream: "wolfstar:events", maxLength: 100_000 });
const stopForwarding = forwardGatewayDispatches(gatewayClient, broker, {
  events: [GatewayDispatchEvents.MessageCreate], // omit to forward every dispatch
  onError: (error, payload) => console.error(`Failed to forward ${payload.t}`, error),
});
```

With [`@wolfstar/plugin-sharder`](https://www.npmjs.com/package/@wolfstar/plugin-sharder), call it in
every shard process: they all publish onto the same stream, and the workers share the load through
their consumer group.

### Gateway process and workers

Run one `GatewayClient` that connects to Discord and forwards its dispatches, and any number of
workers that never connect but replay them on their own `GatewayClient`, so `EventGatewayListener`
pieces behave as if the dispatch happened in-process, `old` arguments included. Both clients must
use the same Redis cache.

```ts
// Gateway process
const gatewayClient = new GatewayClient({ ...options, cache: redisCache });
forwardGatewayDispatches(gatewayClient, broker);
await gatewayClient.start();

// Worker: same cache, never connected
const worker = new GatewayClient({ ...options, cache: redisCache });
const consumer = new BrokerConsumer({
  redis,
  stream: "wolfstar:events",
  group: "workers",
  consumer: "worker-1",
});
replayGatewayDispatches(consumer, worker);
await consumer.start();
```

A worker's `messageUpdate` listener receives the message as it was before the edit: the gateway
process ships that previous state with the dispatch (serialized as raw API data), and the worker
rebuilds it. Relations of that previous state (author, guild, …) resolve from the cache when the
worker handles the entry, so they can be newer than the dispatch. `READY`, `INTERACTION_CREATE` and
shard lifecycle events (`shardReady`, `shardClose`, …) are not replayed, so a worker's `client.user`
stays `null`. Each entry also carries the shard that received the dispatch and its gateway sequence
number, so `raw` listeners get the same payload (`op`, `s`, `t`, `d`) on both sides. An entry is
acknowledged once its listeners resolved (async ones included), so a worker listener that throws or
rejects leaves it pending for redelivery.

Delivery is at-least-once, and a failure is per entry: when one of several listeners of an event throws,
the redelivery runs the ones that already succeeded again, which a connected `GatewayClient` would not
do. Keep worker listeners idempotent, and keep slow work off the replay path (enqueue it instead of
awaiting it): a consumer handles one entry at a time, and an entry pending for longer than `claimIdle`
can be claimed by another worker while it still runs.

Ordering holds per consumer, not across the group. Workers in one consumer group take different
entries and run them concurrently, so two events of the same guild can be replayed out of order
across workers, and the relations a listener resolves from the cache can differ from the gateway
process's. The previous state shipped with each entry is a snapshot, so `old` stays right.

### `BrokerListener` piece

Like `EventGatewayListener` in `@wolfstar/plugin-gateway`, a `BrokerListener` piece typed by event
name is loaded from the `listeners` directory:

```ts
// listeners/log-messages.ts
import {
  BrokerListener,
  RegisterAsBrokerListener,
  type BrokerMessage,
} from "@wolfstar/plugin-broker";

declare module "@wolfstar/plugin-broker" {
  interface BrokerEvents {
    messageCreate: { content: string };
  }
}

@RegisterAsBrokerListener("messageCreate")
export class LogMessagesListener extends BrokerListener<"messageCreate"> {
  public override run(payload: { content: string }, message: BrokerMessage) {
    console.log(`[${message.id}] ${payload.content}`);
  }
}
```

`BrokerEvents` starts empty — augment it in your application to type the events you publish and
consume, the same way `declare module "@wolfstar/http-framework" { interface ClientEvents {} }` works.

### Codec

Payloads are encoded with a `CacheCodec` from
[`@wolfstar/plugin-cache`](https://www.npmjs.com/package/@wolfstar/plugin-cache) — `jsonCodec()` by
default, or `msgpackCodec()` from `@wolfstar/plugin-cache/msgpack` for a denser, still lossless
format. **Every producer and consumer of a stream must be configured with the same codec.**

```ts
import { msgpackCodec } from "@wolfstar/plugin-cache/msgpack";

const broker = createBroker({ redis, stream: "wolfstar:events", codec: msgpackCodec() });
```
