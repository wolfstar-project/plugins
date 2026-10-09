---
"@wolfstar/plugin-gateway": patch
---

Keep the single-call checks that stay right on a cache miss: `GuildMemberRoleManager#fetchHighest`, `GuildMember#fetchPermissions` and `GuildMember#fetchPermissionsIn` are no longer `@deprecated`, reversing part of the deprecation of the `fetch*` twins. The getters they mirror (`roles.highest`, `permissions`, `permissionsIn`, `manageable`, `kickable`, `bannable`, `moderatable`) skip a role the cache lacks without an error, so a hierarchy or permission check can under-report with a filtered cache or a `plugin-broker` worker. Their docs and the README now say so and point at the `fetch*` call or `roles.fetch()`.
