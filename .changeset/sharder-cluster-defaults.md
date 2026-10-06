---
"@wolfstar/plugin-sharder": patch
---

Fix `ClusterStrategy` throwing `Array.prototype.some called on null or undefined` when `execArgv` or `args` are not given: only the given options are passed to `cluster.setupPrimary`, so Node keeps its defaults.

A strategy throwing in `spawn` is now reported as a `ShardSpawnError` (carrying the cause) through `shardError` on every attempt, instead of being retried silently.
