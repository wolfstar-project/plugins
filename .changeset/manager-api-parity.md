---
"@wolfstar/plugin-gateway": minor
---

**Breaking:** discord.js parity for a member's roles, an emoji's roles, and `UserManager`.

`GuildMemberRoleManager` (`member.roles`):

- **Breaking:** built from the member, `new GuildMemberRoleManager(member)`, instead of `(client, guildId, userId, roleIds)`. It exposes `member` and `guild`; `guildId`, `userId` and `ids` are kept.
- **Breaking:** `add` / `remove` always resolve to the updated `GuildMember`: a copy of the member for a single role (it resolved to `void`), the patched member for several. `set` resolves to the member it patched.
- `add` / `remove` / `set` accept a `Role`, an ID, an array of either, or a `Collection` of roles. So do `member.edit({ roles })` and `client.members.add(…, { roles })`.
- New `cache`: a `Collection<Snowflake, Role>` of the member's cached roles, `@everyone` included, uncached roles skipped.
- New `highest`, `hoist`, `color`, `icon`, `premiumSubscriberRole` and `botRole` getters, read from `cache`. The `fetch*` methods stay, as the variants that fall back to the API.
- New `clone()`.
- `color` / `fetchColor()` pick the highest role with a `colors.primaryColor`, as discord.js does.

`GuildEmojiRoleManager` (`emoji.roles`):

- **Breaking:** built from the emoji, `new GuildEmojiRoleManager(emoji)`, exposing `emoji` and `guild`.
- `add` / `remove` / `set` accept `Role`s, IDs, arrays and a `Collection`, and resolve to the emoji they patched. So do the `roles` of `GuildEmojiCreateOptions` / `GuildEmojiEditOptions`.
- New `cache` and `clone()`.

`cache` and the getters are `Awaitable`, the one difference from discord.js: synchronous with the default `CollectionCache`, a promise with an asynchronous store. `highest` is `Role | null`, as `@everyone` may not be cached.

`UserManager`:

- **Breaking:** `createDM(user, { cache, force })` returns the cached direct message channel instead of always calling the API; pass `force: true` for the previous behaviour.
- **Breaking:** `deleteDM(user)` closes the cached channel, and throws `UserNoDMChannel` when there is none, instead of opening one first.
- New `dmChannel(user)` and `User#dmChannel`: the cached direct message channel with a user, `null` when there is none.
- `User#createDM(force?)` and `GuildMember#createDM(force?)`.
- `resolve` / `resolveId` / `fetch` / `send` / `createDM` / `deleteDM` accept a `UserResolvable`: a `User`, a `GuildMember`, a `ThreadMember`, a `Message` (its author), or an ID.

The cached channel is looked up by scanning the channel cache, which is only done on a synchronous cache that can enumerate its entries (`CollectionCache`, the in-memory stores). With `cache: null` or an asynchronous store such as Redis, `dmChannel` is `null`, `createDM` always calls the API, and `deleteDM` asks Discord for the channel first without throwing.

New error codes: `InvalidType`, `InvalidElement` (an invalid role resolvable) and `UserNoDMChannel`. The `RoleResolvables` and `CreateDMOptions` types are exported.
