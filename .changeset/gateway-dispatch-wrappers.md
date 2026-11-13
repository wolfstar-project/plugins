---
"@wolfstar/plugin-gateway": minor
---

`GatewayClient#addDispatchWrapper` runs code around the processing of each dispatch received from Discord, such as a tracing span or an `AsyncLocalStorage` store that the cache writes and listeners run in, and `GatewayClient#addDestroyHook` runs a hook at the end of every `destroy()`, once the shards are disconnected and the dispatches processed, to flush what is left before the process exits.
