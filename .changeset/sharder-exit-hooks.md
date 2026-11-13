---
"@wolfstar/plugin-sharder": minor
---

`ShardClient#addExitHook` runs a hook before the shard stops with `process.exit` (on `exit()`, `restart()`, a close from the manager, or the manager going away), which skips `beforeExit`, so traces or metrics can be flushed first. `ShardManager#addDestroyHook` runs a hook at the end of `destroy()`, once the shards are closed.
