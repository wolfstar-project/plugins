---
"@wolfstar/plugin-cache": minor
---

Index the guild-scoped Redis entity caches by guild (`indexGuilds`, on by default), so a `GUILD_DELETE` drops a guild's entries through the index instead of scanning every entry of every entity cache. `EntityCache` gains an optional `deleteGuild`, which `applyGatewayDispatch` uses when a store implements it and falls back to the scans otherwise.
