---
"@wolfstar/plugin-gateway": minor
---

discord.js's synchronous getters, read from the cache.

- **Derived getters**, next to their `fetch*` twins: `GuildMember#permissions`, `permissionsIn(channel)`, `manageable`, `kickable`, `bannable`, `moderatable`, `displayColor`, `displayHexColor`; `Message#editable`, `deletable`, `bulkDeletable`, `pinnable`, `crosspostable`; `Role#editable`, `Role#permissionsIn(channel)`; `permissionsFor(target)` on guild channels; `GuildEmoji#deletable`, `GuildInvite#deletable`. They read the cache alone and never call the API. An entity they need that is not cached throws `GuildUncached`, `GuildUncachedMe`, `ChannelUncached`, or `GuildMemberUncached`; roles that are not cached are skipped, as in discord.js.
- **Asynchronous caches** (e.g. a Redis store): the same getters answer a promise, read from the cache alone, so `await member.permissions` works there too. Declare `interface GatewayCacheConfig { asynchronous: true }` in a `declare module "@wolfstar/plugin-gateway"` block to have them typed as promises (`CacheRead<T>`). Without the declaration they are typed as plain values, like discord.js's.
- **Relation getters** (`message.guild`, `message.channel`, `member.guild`, `member.voice`, `channel.parent`, `reaction.message`, ...) fall back to a synchronous read of the cache when the manager did not resolve the relation, so structures built by hand, and structures built before their relation was cached, find it. They stay `null` with an asynchronous cache and never throw. `permissionsLocked` benefits from it.
- New error codes: `GuildUncached`, `GuildUncachedMe`, `GuildMemberUncached`, `ChannelUncached`.
