# @wolfstar/plugin-broker

## 0.2.0

### Minor Changes

- [#140](https://github.com/wolfstar-project/plugins/pull/140) [`46a3336`](https://github.com/wolfstar-project/plugins/commit/46a333673b2e834bbb46878d019aeeba6a0b7d86) - Add `@wolfstar/plugin-broker`: distribute gateway events across processes over Redis Streams, with consumer-group semantics and at-least-once delivery. `createBroker` publishes events (`XADD ... MAXLEN ~`); `ClientOptions.broker` configures a `BrokerConsumer`, started automatically once the client starts listening, which reads them through a consumer group (`XGROUP CREATE ... MKSTREAM`, `XREADGROUP`, `XACK`) and redelivers a restarted consumer's own pending entries. `BrokerListener` pieces, loaded from the `listeners` directory like `@wolfstar/plugin-gateway`'s `EventGatewayListener`, are typed per event through an augmentable `BrokerEvents` map and only acknowledged once every matching listener has resolved — a throwing listener leaves its entry pending. Payloads are encoded with a `CacheCodec` from `@wolfstar/plugin-cache` (`jsonCodec()` by default).

### Patch Changes

- Updated dependencies [[`f8a0bc0`](https://github.com/wolfstar-project/plugins/commit/f8a0bc06386884d5b3b1b631f3fd428cb5a79f46)]:
  - @wolfstar/plugin-cache@0.4.0
