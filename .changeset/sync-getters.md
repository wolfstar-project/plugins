---
"@wolfstar/plugin-gateway": minor
---

discord.js's synchronous getters, read from the cache.

- **Derived getters**, next to their `fetch*` twins: `GuildMember#permissions`, `permissionsIn(channel)`, `manageable`, `kickable`, `bannable`, `moderatable`, `displayColor`, `displayHexColor`; `Message#editable`, `deletable`, `bulkDeletable`, `pinnable`, `crosspostable`; `Role#editable`, `Role#permissionsIn(channel)`; `permissionsFor(target)` on guild channels; `GuildEmoji#deletable`, `GuildInvite#deletable`. They never call the API. With an asynchronous cache (e.g. a Redis store) they throw a `GatewayError` with the code `CacheAsynchronous`: use the `fetch*` twin there. An entity they need that is not cached throws `GuildUncached`, `GuildUncachedMe`, `ChannelUncached`, or `GuildMemberUncached`; roles that are not cached are skipped, as in discord.js.
- **Relation getters** (`message.guild`, `message.channel`, `member.guild`, `member.voice`, `channel.parent`, `reaction.message`, ...) fall back to a synchronous read of the cache when the manager did not resolve the relation, so structures built by hand, and structures built before their relation was cached, find it. They stay `null` with an asynchronous cache and never throw. `permissionsLocked` benefits from it.
- New error codes: `GuildUncached`, `GuildUncachedMe`, `GuildMemberUncached`, `ChannelUncached`. The message of `CacheAsynchronous` now points at the `fetch*` methods.
