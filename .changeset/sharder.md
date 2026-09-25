---
"@wolfstar/plugin-sharder": minor
---

Add `@wolfstar/plugin-sharder`, implementing discord.js's sharder RFC (discordjs/discord.js#8084) with the answers of its thread and its two drafts (#7204, #8859). `ShardManager` spawns shards as child processes, cluster workers, worker threads, or on other machines through `ShardManagerProxy` (`NetworkStrategy`, over TLS); it lays gateway shards out automatically, paces identifies across every process, supervises crashes after Erlang/OTP (intensity, period, one-for-one/all/rest), and restarts or reshards with rolling spawns. `ShardClient` is the shard's side: statuses, messages, requests with timeouts, abort and partial broadcasts, gateway shard control, and `gatewayOptions`/`identifyThrottler` for `GatewayClient`. Messages go through named, registrable handlers (JSON, V8, raw) and transformers (gzip, Brotli).
