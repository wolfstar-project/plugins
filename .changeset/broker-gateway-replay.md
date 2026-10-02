---
"@wolfstar/plugin-broker": minor
---

Add `replayGatewayDispatches`, replaying the dispatches `forwardGatewayDispatches` publishes on a `GatewayClient` that never connects to Discord, so workers run `EventGatewayListener` pieces with the same Structures and previous state (`old` arguments) as the gateway process. Stream entries gain an optional `state` (the previous state of the dispatch's entity, encoded like the payload), `shard` and `sequence` (the gateway sequence number) field, `publish` takes them as `options`, and `BrokerMessage` exposes them; entries without them, and consumers unaware of them, work as before.
