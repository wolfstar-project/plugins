---
"@wolfstar/plugin-gateway": patch
---

Track the guilds `clientReady` waits for by shard, like discord.js: a shard's new `READY` now replaces the unavailable guilds its previous one listed instead of adding to them, so a guild the bot left between two `READY`s of a shard (a session invalidated during startup) no longer holds `clientReady` back until `waitGuildTimeout`. The client also stops collecting these guild IDs once `clientReady` fired, where every reconnect's `READY` used to add them to a set that was never emptied.
