# `plugin-broker` × `plugin-gateway` — hydrated consumers across processes

- Scope: a gateway process publishes dispatches over Redis Streams; worker processes that never connect to Discord receive the same `GatewayClient` events, with the same Structures and the same `old` arguments, as an in-process listener would.
- Packages touched: `@wolfstar/plugin-gateway` (replay entry point, state serialization), `@wolfstar/plugin-broker` (both ends of the bridge). `plugin-cache` is unchanged.
- Out of scope: `READY`, `INTERACTION_CREATE`, and per-process shard lifecycle events (`shardReady`, `shardClose`, `shardResume`, `shardError`, `clientReady`); an in-process loopback mode; typed raw `BrokerEvents` for every dispatch type.

## Problem

`forwardGatewayDispatches` already publishes each raw dispatch (`t`, `d`) onto a stream, after the gateway client wrote it to the shared `plugin-cache` entity cache. The consumer side hands listeners that raw payload. A worker therefore cannot reuse `EventGatewayListener` logic: it gets raw API data instead of `Message`, `GuildMember`, … Structures, and it cannot recover the previous state that update/delete events carry (`messageUpdate(old, new)`), because by the time it reads the cache the dispatch has already overwritten it.

The early commits of `wolfstar-project/wolfstar#208` split the bot into a gateway process and workers sharing a Redis cache and a broker. This restores that topology on top of the maintained plugins.

## Topology

```
gateway process(es)                            worker process(es)
GatewayClient(cache = redis cache)             GatewayClient(cache = same redis cache), never connect()ed
  handleDispatch: before → cache write → handle    replayDispatch: handle only
  forwardGatewayDispatches ── XADD ──► stream ──► BrokerConsumer ── replayGatewayDispatches
                           {event, payload, state?}
```

Workers run `EventGatewayListener` pieces unchanged. Gateway process(es) may keep their own listeners too.

## `plugin-gateway`

### Replay entry point

`GatewayClient#handleDispatch` splits into two halves sharing one code path:

- Producer half (unchanged behavior): emit `raw`, `before`, cache write, emit `dispatch`, `action.handle`.
- Consumer half, `replayDispatch(payload, shardId, state?)`: emit `raw`, then `action.handle(payload.d, state, shardId)` only. No `before`, no cache write, no `dispatch` event (workers must not re-forward), no `READY`/`clientReady` bookkeeping: `READY` is ignored like `INTERACTION_CREATE`. The dispatch partition queue is used so a guild's dispatches stay ordered within a worker. `replayDispatch` rejects when a listener throws (the queue itself keeps going), so the caller can leave the entry unacknowledged.

`DispatchHandlers`/`MultiDispatchHandlers` are untouched: workers cannot drift from the gateway process.

A worker `GatewayClient` is constructed with the same cache and token but `connect()`/`start({ listen })`'s gateway step are never called. Its REST and managers work as usual, so listeners can still fetch.

### State on the `dispatch` event

`emit("dispatch", payload, shardId, state)` gains a trailing `state` argument: the value `action.before` resolved to. Adding a trailing argument is backward compatible.

### State serialization

Each `before`-bearing handler has a codec for how its state travels. The codecs live in `plugin-gateway`'s `util/dispatchState.ts` (`DispatchStateCodecs`, keyed by dispatch type), leaving `DispatchHandlers` untouched; a coverage-guard test fails when a handler with a `before` has no codec:

```ts
interface DispatchStateCodec {
  serialize(state: unknown): unknown; // plain data, codec-safe
  revive(client: GatewayClient, state: unknown, data: any): Awaitable<unknown>;
}
```

`data` is the dispatch data, needed by guild-scoped managers such as `client.guilds.invites(data.guild_id)`.

Shared helpers cover the shapes that occur:

- `single(manager)`: `Structure | undefined` ↔ `{ data } | undefined`. `serialize` uses the Structure's `toJSON()` (the raw API data); `revive` calls `manager.hydrate(data)`.
- `list(manager)`: `Structure[]` ↔ `data[]` (`MessageDeleteBulk`, `ThreadMembersUpdate`, `GuildEmojisUpdate`, `GuildStickersUpdate`).
- Reaction collections (`MessageReactionRemoveAll`, `MessageReactionRemoveEmoji`) get explicit codecs, as their `before` returns `MessageReaction`s read off the message.

`revive` uses `hydrate`, **not** `resolveData`: `resolveData` returns the cached (already-updated) entity when one exists, which is exactly the value `old` must not be. A revived structure's relations (author, guild, …) are resolved from the cache as it is when the worker handles the entry; they can be newer than the dispatch. This is documented, and matches what an in-process listener sees for any relation not rebuilt from the dispatch.

Handlers without `before`, and handlers whose `before` returns `undefined`, serialize to no `state` field.

## `plugin-broker`

### Wire format

The stream entry gains an optional field: `event`, `payload`, and `state` (base64 of `codec.encode(state)`, same codec as `payload`). `BrokerMessage` gains optional `state`. Entries without `state` (every entry produced today) decode and dispatch exactly as before, and old consumers ignore the extra field, so a rolling deploy needs no coordination. `createBroker().publish(event, payload, options?)` gains `options.state`.

### Producer: `forwardGatewayDispatches`

Unchanged for emitters that only emit `(payload, shardId)`. For a `GatewayClient` (its `dispatch` event now passing `state`), it asks the dispatch type's codec to serialize the state and publishes it with the entry. The codec table lives in `plugin-gateway` and reaches `plugin-broker` structurally, through a new optional member on `GatewayDispatchEmitterLike` (`serializeDispatchState(type, state)`), so `plugin-broker` still has no runtime dependency on `plugin-gateway`. An emitter without it publishes no state. A throwing `serializeDispatchState` is reported through `onError` and the dispatch is still published, without state. `shard` is published only when non-zero.

### Consumer: `replayGatewayDispatches(consumer, client, options?)`

```ts
interface GatewayReplayTargetLike {
  readonly replayDispatchTypes: readonly string[];
  replayDispatch(payload: { t: string; d: unknown }, shardId: number, state?: unknown): Promise<void>;
  reviveDispatchState(type: string, state: unknown, data: unknown): Promise<unknown>;
}
replayGatewayDispatches(consumer: BrokerConsumer, client: GatewayReplayTargetLike, options?: { events?: readonly string[] }): () => void;
```

It registers a listener per forwarded dispatch type (`options.events`, else `client.replayDispatchTypes`: every type with an action, minus `READY`), which revives `state` and awaits `client.replayDispatch`. The returned promise is what `BrokerConsumer` already awaits before `XACK`: a worker whose listener throws leaves the entry pending, so at-least-once delivery is preserved end to end. Returns a function removing the listeners.

`shardId` is not on the stream today; it is added as an optional `shard` field and defaults to `0` when absent.

## Failure modes

- Cache read fails while building an event on a worker: the existing `cacheErrors`/`cacheFailure` semantics of the worker's client apply; with `cacheFailure: "skip"` the entry is left pending and retried.
- Revival fails (corrupt `state`): treated as a listener failure (entry left pending, eventually dead-lettered), never silently replaced by `undefined`.
- A dispatch type unknown to the worker's `plugin-gateway` version: no action, no listener; the entry is acknowledged by `BrokerConsumer` as it is for any event nobody listens to.
- Producer and workers on different `plugin-gateway` versions: `state` is plain raw API data keyed by dispatch type, so a version skew degrades to the worker's own `hydrate` of that data, not to a crash.

## Testing

- Round trip over `FakeStreamRedis` with a shared in-memory cache between a producer `GatewayClient` and a worker `GatewayClient`: feeding a dispatch to the producer yields, on the worker, the same event name and equal arguments (including `old`) as the producer's own listener received. Run for `messageUpdate`, `guildMemberUpdate`, `channelUpdate`, `messageDeleteBulk` (list), `messageReactionRemoveAll` (reaction collection), and `guildEmojisUpdate` (multi-event).
- One test per state shape: single, list, reaction collection, absent.
- Wire compatibility: an entry with no `state` replays; an entry with `state` is still dispatched to a plain `BrokerListener`.
- Ack semantics: a throwing worker listener leaves the entry pending; redelivery replays it.
- The worker emits no `dispatch` event (no re-forwarding loop).
- Type-level consumption test in `plugin-broker/tests/types` that a real `GatewayClient` satisfies `GatewayDispatchEmitterLike` and `GatewayReplayTargetLike` (checked by `golar tsc`, appended already for `plugin-broker`).

## Release

Changesets: `plugin-gateway` (minor: `replayDispatch`, `dispatch` state argument, state codecs), `plugin-broker` (minor: `state`/`shard` entry fields, `replayGatewayDispatches`). README of `plugin-broker`: the "Forwarding gateway dispatches" section gains a gateway process + workers example. `AGENTS.md` needs no change (no command, package, CI, or release-flow change).
