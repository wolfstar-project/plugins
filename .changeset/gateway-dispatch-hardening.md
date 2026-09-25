---
"@wolfstar/plugin-gateway": patch
---

Process dispatches in per-guild partitions instead of one queue per shard, report dispatches slower than `dispatchTimeout`, add a `cacheFailure` policy (`"skip"` or `"emitUncached"`), accept `{ force, cache }` options on managers' `fetch`, and drop the cached guilds a new `READY` no longer lists. `READY` itself is always emitted, even when the cache fails.
