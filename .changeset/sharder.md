---
"@wolfstar/plugin-sharder": minor
---

Add `@wolfstar/plugin-sharder`, multi-process sharding after the discord.js sharder RFC: `ShardManager` spawns shards as child processes (`ForkStrategy`), cluster workers (`ClusterStrategy`), or worker threads (`WorkerStrategy`), respawns and pings them, and carries messages and requests between them; `ShardClient` is the shard's side, with `gatewayOptions` for `GatewayClient`. Messages are serialized as JSON or with `node:v8`, through optional gzip or Brotli transformers.
