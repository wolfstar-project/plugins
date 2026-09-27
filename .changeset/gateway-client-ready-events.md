---
"@wolfstar/plugin-gateway": minor
---

- Add `GatewayEvents`, an enum mirroring the keys of `GatewayEventMap`, like `@wolfstar/http-framework`'s own `Events`: `client.on(GatewayEvents.MessageCreate, ...)` is interchangeable with the string literal `client.on("messageCreate", ...)`. The internal dispatch table now emits through it.
- Add the `clientReady` event, like discord.js's `Client#clientReady`: emitted once, after every shard the client manages has connected and every guild `READY` listed as initially unavailable became available, or the new `waitGuildTimeout` option (`15_000` ms by default, matching discord.js's, skipped without the `Guilds` intent) elapses. `GatewayClient` gains `clientReadyTimestamp`, `clientReadyAt`, and `isClientReady()`.
