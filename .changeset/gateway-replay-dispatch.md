---
"@wolfstar/plugin-gateway": minor
---

Let a `GatewayClient` that never connects to Discord receive the events of another process's client. The `dispatch` event gains a trailing `state` argument (what the dispatch's handler read before the cache write, e.g. the cached message a `MESSAGE_UPDATE` replaces), `serializeDispatchState`/`reviveDispatchState` carry that state across processes as raw API data (`DispatchStateCodecs`), and `replayDispatch`/`replayDispatchTypes` handle a dispatch another process wrote to the shared cache, emitting `raw` and the matching event without reading or writing the cache and without emitting `dispatch`.
