---
"@wolfstar/plugin-gateway": minor
"@wolfstar/plugin-cache": minor
---

Resume gateway sessions across restarts. `GatewayClient` gains a `sessionStore` option (and `sessionStoreTimeout`), read once per shard and mirrored in memory, with background writes collapsed per shard; store failures are reported as `GatewaySessionStoreError`s and fall back to identifying. `GatewayClient#destroy({ resumable: true })` closes the shards with a resumable code and keeps their sessions stored, for the next process to resume them. `@wolfstar/plugin-cache` ships `createRedisSessionStore`, with a `ttl` (10 minutes by default), and the `GatewaySessionStore`/`GatewaySessionInfo` types.
