---
"@wolfstar/plugin-broker": minor
---

Complete the at-least-once delivery story of `BrokerConsumer`: `claimIdle` claims (`XAUTOCLAIM`) the entries any consumer of the group left pending for too long, e.g. one that crashed and never restarted under the same name; `maxDeliveries` moves an entry that keeps failing to a dead-letter stream (`deadLetterStream`, `<stream>:dead` by default) instead of retrying it forever; and `shutdownSignals` stops the consumer on the given process signals, awaiting the in-flight entry, before letting the signal terminate the process. Add `forwardGatewayDispatches`, which publishes every dispatch a `@wolfstar/plugin-gateway` `GatewayClient` receives onto a broker once it is written to the client's cache.

Also fix a consumer whose own pending entries could never be drained: reading a consumer's history resolves to an empty list rather than `null` once exhausted, and an entry that failed again was re-read forever, so the consumer never moved on to new entries. An entry trimmed from the stream while pending is now acknowledged instead of failing to decode.
