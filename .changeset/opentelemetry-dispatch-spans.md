---
"@wolfstar/plugin-opentelemetry": minor
---

On a `GatewayClient` of `@wolfstar/plugin-gateway` 0.17 or later, the plugin opens one span per gateway dispatch, the root of a trace of its own, around its cache writes and listeners (`dispatches`, on by default, with `dispatches.ignore` for noisy types), and calls `flushTraces()` at the end of `GatewayClient#destroy` (`flushOnDestroy`, on by default). The README shows how to wire `flushTraces()` into the exit hooks of `@wolfstar/plugin-sharder`.
