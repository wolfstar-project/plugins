---
"@wolfstar/plugin-gateway": minor
---

`client.presences.resolve` and `resolveId` accept a `PresenceResolvable` (a `Presence`, a `GuildMember`, a `User`, a `ThreadMember`, a `Message`, or a user ID), like discord.js. `resolveId` returns the user ID, where it used to answer `null` for a `Presence`, and `resolve(value, guildId?)` reads the cached presence of the user in the member's, message's or given guild, answering `null` on a miss, a DM message, or an uncached entity.

**Breaking:** `presences.resolve(string)` now takes a user ID, not the cache key. Read a key with `presences.cache.get(presences.resolveKey(guildId, userId))`.
