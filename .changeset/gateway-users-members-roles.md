---
"@wolfstar/plugin-gateway": minor
---

Bring users, guild members and roles to discord.js parity: every API field, CDN URLs, `ClientUser` (profile edits and presence on every shard), `GuildMemberRoleManager`, permission computation, member moderation (edit, timeout, kick, ban, bulk ban, prune), member listing and search, and role creation, editing, positioning and deletion. `Role#permissions` is now a `PermissionsBitField` instead of a `bigint`.
