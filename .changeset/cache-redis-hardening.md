---
"@wolfstar/plugin-cache": patch
---

Write and delete Redis values together with their index entry in a single `MULTI` transaction, prune expired index entries on every write when a `ttl` is set, and reject unreadable values (invalid JSON or corrupt compressed bytes) with a `CacheValueError` naming the key.
