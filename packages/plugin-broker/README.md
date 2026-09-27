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
  },
});
```

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

## Not yet implemented

This is the MVP slice of the [RFC](https://github.com/wolfstar-project/plugins/issues/136). Tracked
as follow-ups:

- `XAUTOCLAIM` of entries left by a consumer that crashed under a _different_ name (this version only
  redelivers a restarted consumer's own pending entries, under the same name).
- `maxDeliveries` and a dead-letter stream.
- A `forwardGatewayDispatches` helper bridging `@wolfstar/plugin-gateway` dispatches straight onto a
  broker.
- Signal-driven (`SIGTERM`/`SIGINT`) automatic shutdown — call `container.broker.stop()` yourself,
  which awaits the in-flight batch before returning.
