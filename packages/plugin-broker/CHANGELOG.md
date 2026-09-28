# @wolfstar/plugin-broker

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
