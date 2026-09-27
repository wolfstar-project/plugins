# `@wolfstar/plugin-broker` — distribute gateway events across processes over Redis Streams

- Issue: [wolfstar-project/plugins#136](https://github.com/wolfstar-project/plugins/issues/136)
- Branch: stacked on `137-plugin-cache-codec` so this package can depend on the real `CacheCodec`/`jsonCodec` exported by `@wolfstar/plugin-cache`, rather than a local duplicate. Rebases onto `main` once #137 merges.
- Scope: MVP core mechanics — producer, consumer-group consumer, `BrokerListener` piece. `XAUTOCLAIM` reclaim of dead consumers, `maxDeliveries` + dead-letter stream, `forwardGatewayDispatches`, and benchmarks are explicitly out of scope, tracked as follow-ups.

## Problem

WolfStar's in-house `MessageBroker` (Redis Streams, no consumer group) lets every worker receive every message with no load sharing, loses messages published while a worker is down, and its `ack()` is a no-op. This RFC turns the idea into a maintained plugin with real consumer-group semantics.

## Package shape

Scaffolded like `plugin-logger`: `exports` map with `.` and `./register`, `tsconfig.json` extending the base, `tsdown` build. `peerDependencies`: `@wolfstar/http-framework` (same range as `plugin-gateway`). Regular workspace dependency on `@wolfstar/plugin-cache` for `CacheCodec`/`jsonCodec`.

## Redis client surface

A `BrokerRedisClientLike` interface, following the same convention as `plugin-cache`'s `RedisClientLike`: the exact subset of `ioredis`'s own overloads actually used, verified by a `tests/types/ioredis.ts` consumption test (checked by `golar tsc` like `plugin-cache`'s and `plugin-gateway`'s already are). Only `xadd`, `xgroup` (`CREATE ... $ MKSTREAM`), `xreadgroup` (with and without `BLOCK`), and `xack` — no `XAUTOCLAIM`/`XPENDING` yet.

## Producer

```ts
export function createBroker(options: {
  redis: BrokerRedisClientLike;
  stream: string;
  maxLength?: number; // XADD MAXLEN ~, default unset (no trimming)
  codec?: CacheCodec; // default jsonCodec()
}): { publish(event: string, payload: unknown): Promise<string> };
```

`publish` does `XADD <stream> [MAXLEN ~ <maxLength>] * event <event> payload <base64(codec.encode(payload))>`. The payload is always base64'd (regardless of whether the codec produced a `Buffer` or a `string`): unlike `plugin-cache`'s Redis strings, stream field values don't need a backward-compatible untagged fast path, so a single, unconditional encoding keeps the format simple. **Producers and consumers of a stream must be configured with the same codec** — unlike the persistent cache in #137, a stream is transient (trimmed by `maxLength`) and this MVP does not replicate the cache's per-value codec-migration tagging.

## Consumer

```ts
export interface BrokerConsumerOptions {
  redis: BrokerRedisClientLike;
  stream: string;
  group: string;
  consumer: string;
  batchSize?: number; // COUNT, default 10
  block?: number; // BLOCK ms, default 5_000
  codec?: CacheCodec; // default jsonCodec(), must match the producer's
}

export class BrokerConsumer implements Listener.Emitter {
  constructor(options: BrokerConsumerOptions);
  async start(): Promise<void>;
  async stop(): Promise<void>;
  // on/once/off/setMaxListeners/getMaxListeners/emit: the `Listener.Emitter` contract.
}
```

`start()` runs `XGROUP CREATE <stream> <group> $ MKSTREAM`, ignoring a `BUSYGROUP` error (group already exists), then loops: first drains this consumer's own pending entries (`XREADGROUP ... STREAMS <stream> 0`, no `BLOCK`) to redeliver anything left unacked by a previous crash of a consumer with the _same name_, then reads new entries (`XREADGROUP ... COUNT <batchSize> BLOCK <block> STREAMS <stream> >`) until `stop()` is called.

Each entry is decoded (`event`, `payload`) and handed to `BrokerListener` pieces through the `Listener.Emitter` contract `BrokerConsumer` implements itself — matching how `EventGatewayListener` pieces attach to `GatewayClient` as their `emitter`. Unlike the framework's own fire-and-forget `emit`, `BrokerConsumer`'s internal dispatch collects every synchronously-returned listener promise for that one `emit()` call and awaits them before deciding whether to acknowledge: on success, `XACK`; on a throwing listener, the entry is left pending (no ack), redelivered on the next `start()` (or a future `XAUTOCLAIM`-based reclaim, once that follow-up lands). Entries within one batch are processed sequentially, so no other entry's listeners are ever in flight when awaiting one entry's — this is what makes "await this entry's listeners" well-defined without needing the framework's own `AsyncEventEmitter`.

`stop()` clears the run flag and awaits the in-flight loop iteration, so it does not return until the current batch's handlers have settled (baseline graceful shutdown; signal wiring is left to the bot author, documented in the README).

## `BrokerListener` piece

```ts
export abstract class BrokerListener<Event extends BrokerEventName = BrokerEventName> extends Listener<...> {
  public abstract override run(payload: BrokerEventMap[Event], message: BrokerMessage): Awaitable<unknown>;
}

export function RegisterAsBrokerListener<Event extends BrokerEventName>(event: Event, options?): ClassDecorator;
```

Mirrors `EventGatewayListener`/`RegisterAsGatewayListener` exactly (same `LoaderContext`, same decorator shape substituting a class' constructor call). An augmentable `interface BrokerEvents {}` (mapped to `BrokerEventMap`/`BrokerEventName` the same way `GatewayEventMap`/`GatewayEventName` work) types payloads per event. `BrokerListener`'s default `emitter` resolves to the `broker` `Container` key.

## Framework wiring (`./register`)

Like `plugin-logger`, an _active_ plugin hook (not the no-op `plugin-cache`/`plugin-gateway` pattern), because `plugin-broker` adds new `ClientOptions`/`Container` surface rather than just exporting library code:

```ts
declare module "@wolfstar/http-framework" {
  interface ClientOptions {
    broker?: BrokerConsumerOptions;
  }
  interface Container {
    broker?: BrokerConsumer;
  }
}
```

`BrokerPlugin` hooks `preGenericsInitialization` (construct `container.broker = new BrokerConsumer(options.broker)` when `options.broker` is set — mirrors `container.gatewayClient = this` in `GatewayClient`'s constructor) and `postListen` (`await container.broker?.start()`, after pieces are loaded by `client.load()` and the HTTP server is listening, matching `preLoad`/`postListen`'s position relative to `Client#load`/`Client#listen`).

## Non-goals (deferred, follow-up issues)

- `XAUTOCLAIM` of entries left by consumers that crashed under a _different_ consumer name (this MVP only redelivers a restarted consumer's own pending entries under the same name).
- `maxDeliveries` and a dead-letter stream.
- `forwardGatewayDispatches` bridge helper for `plugin-gateway`.
- Signal-driven (`SIGTERM`/`SIGINT`) automatic shutdown wiring.

## Testing

A local `tests/fixtures/FakeStreamRedis.ts` (self-contained to this package, not the shared `tests/fixtures/FakeRedis.ts` `plugin-cache` uses, to avoid cross-worktree conflicts) implementing `BrokerRedisClientLike`: `Map`-backed stream with a pending-entries list (PEL) per group, `XGROUP CREATE` throwing a `BUSYGROUP`-message `Error` on a pre-existing group, `XREADGROUP` honoring `0` (this consumer's PEL) vs `>` (new entries) cursors, `XACK` removing from the PEL, `XADD` honoring `MAXLEN ~` trimming.

1. `createBroker().publish` — `XADD` shape, `MAXLEN` trimming, base64 payload round-trips through the configured codec.
2. `BrokerConsumer` — group creation is idempotent (a second `start()` on an existing group does not throw); a dispatched entry reaches a registered `BrokerListener`-equivalent handler and is acked; a throwing handler leaves the entry pending; a restarted consumer (same name) redelivers its own pending entries before new ones.
3. `BrokerListener`/`RegisterAsBrokerListener` — mirrors `EventGatewayListener.test.ts`: emitter/event resolution, the decorator needing no constructor, `once` unloading.
4. `BrokerPlugin` hooks — mirrors `plugin-logger`'s `register.test.ts`: `preGenericsInitialization` installs `container.broker` only when `options.broker` is set; `postListen` calls `start()` on it.
