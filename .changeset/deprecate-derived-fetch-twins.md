---
"@wolfstar/plugin-gateway": minor
---

Deprecate the derived `fetch*` twins of discord.js's getters, and remove `Message#fetchEditable`.

- **Removed**: `Message#fetchEditable()`. It compared two IDs and never awaited, so use the `Message#editable` getter.
- **Deprecated**, to be removed in a later release: `GuildMember#fetchPermissions`, `fetchPermissionsIn`, `fetchManageable`, `fetchKickable`, `fetchBannable`, `fetchModeratable`, `fetchDisplayColor`, `fetchDisplayHexColor`; `Message#fetchDeletable`, `fetchBulkDeletable`, `fetchPinnable`, `fetchCrosspostable`; `Role#fetchEditable`, `fetchPermissionsIn`; `fetchPermissionsFor` and `fetchPermissionsLocked` on guild channels; `GuildEmoji#fetchDeletable`, `GuildInvite#fetchDeletable`; `GuildMemberRoleManager#fetchHighest`, `fetchHoist`, `fetchColor`, `fetchIcon`, `fetchPremiumSubscriberRole`, `fetchBotRole`. Each points at its getter in its `@deprecated` notice.
- **Kept**: every entity fetch (`fetchGuild`, `fetchChannel`, `fetchMember`, `client.members.fetchMe`, `roles.fetch()`, ...) and `GuildMember#fetchPresence`, which is the only way to read a presence with an asynchronous cache.
- **Migrating** when the cache may lack an entity (a size-limited or filtered cache, a `plugin-broker` worker): fetch it (`client.guilds.fetch(guildId)`, `client.members.fetchMe(guildId)`, `member.roles.fetch()`), then read the getter.
