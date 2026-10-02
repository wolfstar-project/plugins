---
"@wolfstar/plugin-gateway": minor
---

Add discord.js-style sweepers and cache limits. The `sweepers` client option and `client.sweepers` (`Sweepers`, with `sweepMessages`, `sweepUsers`, `sweepThreads`, ..., `filterByLifetime` and `outdatedThreadSweepFilter`) evict entries of the instance caches on a timer or on demand, emitting `cacheSweep`. `cacheOptions.<entity>.keepOverLimit` mirrors `LimitedCollection#keepOverLimit`, and `cacheWithLimits` and `DefaultSweeperSettings` are ready-made presets. Sweepers cannot be combined with `cache` or `makeCache`.
