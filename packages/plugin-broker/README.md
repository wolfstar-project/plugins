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
