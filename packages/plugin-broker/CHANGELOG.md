# @wolfstar/plugin-broker

## 0.7.1

### Patch Changes

- [#240](https://github.com/wolfstar-project/plugins/pull/240) [`16d62bd`](https://github.com/wolfstar-project/plugins/commit/16d62bdd9a7850d4451082ab6193f8300b924c0b) - fix(deps): update all non-major dependencies Thanks [@renovate](https://github.com/apps/renovate)!
- Updated dependencies [[`16d62bd`](https://github.com/wolfstar-project/plugins/commit/16d62bdd9a7850d4451082ab6193f8300b924c0b)]:
  - @wolfstar/plugin-cache@0.8.1

## 0.7.0

### Minor Changes

- [#259](https://github.com/wolfstar-project/plugins/pull/259) [`e9c503d`](https://github.com/wolfstar-project/plugins/commit/e9c503da60e60a732bc916250c0d875919a9714c) - Every module sets `meta.configKey`, so an application writes a module's options under its own top-level key of `stars.config` (`api`, `broker`, `cache`, `gateway`, `i18n`, `logger`, `scheduledTasks`, `sharder`, `subcommandsAdvanced`) instead of the `[specifier, options]` tuple of `modules`. The tuple still works and is merged over the key. The key is typed in `defineConfig` once the module is imported in `stars.config.ts`; `cache`, `gateway`, `sharder` and `subcommandsAdvanced` take no options yet and only reserve their name.

  The `@wolfstar/kit` peer range moves from `^0.1.0` to `^0.2.0`, the first version that reads `configKey`, and `@wolfstar/schema` (`^0.9.0`) is a new optional peer that carries the `StarsConfig` type the keys extend. A project on `@wolfstar/kit` 0.1 has to update it.

### Patch Changes

- Updated dependencies [[`e9c503d`](https://github.com/wolfstar-project/plugins/commit/e9c503da60e60a732bc916250c0d875919a9714c)]:
  - @wolfstar/plugin-cache@0.8.0

## 0.6.0

### Minor Changes

- [#245](https://github.com/wolfstar-project/plugins/pull/245) [`7257223`](https://github.com/wolfstar-project/plugins/commit/7257223baea1785c72737e103243ab381f6f29f7) - `forwardGatewayDispatches` marks a `GatewayClient` as forwarding (`forwardsDispatches`) until its stop function is called, through the new optional `GatewayDispatchEmitterLike#markDispatchesForwarded`, so listeners registered with `RegisterAsDispatchListener` from `@wolfstar/plugin-gateway` run on the workers only. Emitters without it forward as before.

### Patch Changes

- [#247](https://github.com/wolfstar-project/plugins/pull/247) [`6012bd9`](https://github.com/wolfstar-project/plugins/commit/6012bd9d16cc73abd5e0c866a6ab2d407e3c3b79) - Forward the `guildDelete` of a guild a `READY` drops: when a `READY` no longer lists a cached guild (the bot left it while offline), `GatewayClient` now emits `dispatch` for the `GUILD_DELETE` it applies, after the cache write and with the cached guild as its state, before `guildDelete`. `forwardGatewayDispatches` publishes it like any other dispatch, so a `plugin-broker` worker's `guildDelete` listeners clean these guilds up too. The made-up dispatch carries `s: 0` and is not emitted as `raw`.

## 0.5.1

### Patch Changes

- Updated dependencies [[`4748f09`](https://github.com/wolfstar-project/plugins/commit/4748f09609e664fad9eede140da141d9f5efa1cc)]:
  - @wolfstar/plugin-cache@0.7.0

## 0.5.0

### Minor Changes

- [#192](https://github.com/wolfstar-project/plugins/pull/192) [`aa389c8`](https://github.com/wolfstar-project/plugins/commit/aa389c8925cfc26bb5ea6db65cda5f76855f6e33) - Add `@wolfstar/plugin-broker/module` and `@wolfstar/plugin-broker/plugin`: list the module in `modules` in `stars.config`, or pass the `definePlugin` factory to `plugins`. Both need framework 6.1 (and `@wolfstar/kit` for the module); `./register` is unchanged and still supports framework v3, v5 and v6.

### Patch Changes

- Updated dependencies [[`69129e9`](https://github.com/wolfstar-project/plugins/commit/69129e9910c83f973701d55611ddd123b88d39c4)]:
  - @wolfstar/plugin-cache@0.6.0

## 0.4.1

### Patch Changes

- [#176](https://github.com/wolfstar-project/plugins/pull/176) [`c989f83`](https://github.com/wolfstar-project/plugins/commit/c989f8396af21be2038ffbb513e38eb1189ccbde) - Accept `@wolfstar/http-framework` v6 in the peer range (`|| ^6.0.0`).

## 0.4.0

### Minor Changes

- [#168](https://github.com/wolfstar-project/plugins/pull/168) [`8780f43`](https://github.com/wolfstar-project/plugins/commit/8780f43239145b7ad21d1f3dcd03f934264eab9b) - Add `replayGatewayDispatches`, replaying the dispatches `forwardGatewayDispatches` publishes on a `GatewayClient` that never connects to Discord, so workers run `EventGatewayListener` pieces with the same Structures and previous state (`old` arguments) as the gateway process. Stream entries gain an optional `state` (the previous state of the dispatch's entity, encoded like the payload), `shard` and `sequence` (the gateway sequence number) field, `publish` takes them as `options`, and `BrokerMessage` exposes them; entries without them, and consumers unaware of them, work as before.

### Patch Changes

- Updated dependencies [[`6468763`](https://github.com/wolfstar-project/plugins/commit/646876363da7dc2b730a8fb7ed3011cd11a38859)]:
  - @wolfstar/plugin-cache@0.5.1

## 0.3.1

### Patch Changes

- Updated dependencies [[`a2da4d8`](https://github.com/wolfstar-project/plugins/commit/a2da4d886a9e6b2f4ed54f6ba79b93bdd076746e)]:
  - @wolfstar/plugin-cache@0.5.0

## 0.3.0

### Minor Changes

- [#147](https://github.com/wolfstar-project/plugins/pull/147) [`77aa9cc`](https://github.com/wolfstar-project/plugins/commit/77aa9cc4602b6b77fd38decbea103e644cd7b9af) - Complete the at-least-once delivery story of `BrokerConsumer`: `claimIdle` claims (`XAUTOCLAIM`) the entries any consumer of the group left pending for too long, e.g. one that crashed and never restarted under the same name; `maxDeliveries` moves an entry that keeps failing to a dead-letter stream (`deadLetterStream`, `<stream>:dead` by default) instead of retrying it forever; and `shutdownSignals` stops the consumer on the given process signals, awaiting the in-flight entry, before letting the signal terminate the process. Add `forwardGatewayDispatches`, which publishes every dispatch a `@wolfstar/plugin-gateway` `GatewayClient` receives onto a broker once it is written to the client's cache.

  Also fix a consumer whose own pending entries could never be drained: reading a consumer's history resolves to an empty list rather than `null` once exhausted, and an entry that failed again was re-read forever, so the consumer never moved on to new entries. An entry trimmed from the stream while pending is now acknowledged instead of failing to decode.

## 0.2.0

### Minor Changes

- [#140](https://github.com/wolfstar-project/plugins/pull/140) [`46a3336`](https://github.com/wolfstar-project/plugins/commit/46a333673b2e834bbb46878d019aeeba6a0b7d86) - Add `@wolfstar/plugin-broker`: distribute gateway events across processes over Redis Streams, with consumer-group semantics and at-least-once delivery. `createBroker` publishes events (`XADD ... MAXLEN ~`); `ClientOptions.broker` configures a `BrokerConsumer`, started automatically once the client starts listening, which reads them through a consumer group (`XGROUP CREATE ... MKSTREAM`, `XREADGROUP`, `XACK`) and redelivers a restarted consumer's own pending entries. `BrokerListener` pieces, loaded from the `listeners` directory like `@wolfstar/plugin-gateway`'s `EventGatewayListener`, are typed per event through an augmentable `BrokerEvents` map and only acknowledged once every matching listener has resolved — a throwing listener leaves its entry pending. Payloads are encoded with a `CacheCodec` from `@wolfstar/plugin-cache` (`jsonCodec()` by default).

### Patch Changes

- Updated dependencies [[`f8a0bc0`](https://github.com/wolfstar-project/plugins/commit/f8a0bc06386884d5b3b1b631f3fd428cb5a79f46)]:
  - @wolfstar/plugin-cache@0.4.0
