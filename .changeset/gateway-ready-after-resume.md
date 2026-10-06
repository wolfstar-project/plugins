---
"@wolfstar/plugin-gateway": patch
---

Fix `GatewayClient` never becoming ready when its shards resume a stored session (`sessionStore`). A shard that resumes gets `RESUMED` and no `READY`, so `clientReady` was never emitted, `isClientReady()` stayed `false` and `client.user` stayed `null`. The client now restores `client.user` from the cache, or from `GET /users/@me` when the cache does not hold it, and emits `clientReady` once every shard is ready, whether it got there through `READY` or `RESUMED`. A failed restore is reported through `error` and does not hold `clientReady` back.
