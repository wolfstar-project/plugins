---
"@wolfstar/plugin-broker": minor
---

Add `@wolfstar/plugin-broker`: distribute gateway events across processes over Redis Streams, with consumer-group semantics and at-least-once delivery. `createBroker` publishes events (`XADD ... MAXLEN ~`); `ClientOptions.broker` configures a `BrokerConsumer`, started automatically once the client starts listening, which reads them through a consumer group (`XGROUP CREATE ... MKSTREAM`, `XREADGROUP`, `XACK`) and redelivers a restarted consumer's own pending entries. `BrokerListener` pieces, loaded from the `listeners` directory like `@wolfstar/plugin-gateway`'s `EventGatewayListener`, are typed per event through an augmentable `BrokerEvents` map and only acknowledged once every matching listener has resolved — a throwing listener leaves its entry pending. Payloads are encoded with a `CacheCodec` from `@wolfstar/plugin-cache` (`jsonCodec()` by default).
