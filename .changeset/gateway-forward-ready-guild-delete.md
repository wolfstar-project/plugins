---
"@wolfstar/plugin-gateway": patch
"@wolfstar/plugin-broker": patch
---

Forward the `guildDelete` of a guild a `READY` drops: when a `READY` no longer lists a cached guild (the bot left it while offline), `GatewayClient` now emits `dispatch` for the `GUILD_DELETE` it applies, after the cache write and with the cached guild as its state, before `guildDelete`. `forwardGatewayDispatches` publishes it like any other dispatch, so a `plugin-broker` worker's `guildDelete` listeners clean these guilds up too. The made-up dispatch carries `s: 0` and is not emitted as `raw`.
