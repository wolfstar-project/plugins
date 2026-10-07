# Manager API parity (sub-project B) — design

Date: 2026-10-01, refreshed 2026-10-02 after sub-project A (`2026-10-01-cache-core-design.md`, #163) landed.
Package: `@wolfstar/plugin-gateway`
Status: **implemented** (#165).

Scope: `GuildMemberRoleManager`, `GuildEmojiRoleManager` and `UserManager`. The goal is that code written against
discord.js keeps working with at most an added `await`.

Out of scope, tracked separately: `Collection` results for `list` / `fetchAll` / `search` / `listCached`, and the
guild- and channel-scoped managers (`guild.members`, `channel.messages`, …).

## `GuildMemberRoleManager`

Reference: discord.js
[`GuildMemberRoleManager.js`](https://github.com/discordjs/discord.js/blob/main/packages/discord.js/src/managers/GuildMemberRoleManager.js).

| discord.js                                                              | Before                               | Now                                                                                           |
| ----------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------- |
| `new GuildMemberRoleManager(member)`                                    | `(client, guildId, userId, roleIds)` | `(member)`                                                                                    |
| `member`, `guild`                                                       | missing                              | `member: GuildMember`, `guild: Guild \| null` (the member's cached guild)                     |
| `cache: Collection<Snowflake, Role>`                                    | missing (`fetch(): Role[]`)          | `cache: Awaitable<Collection<Snowflake, Role>>`, `@everyone` included, uncached roles skipped |
| `highest`, `hoist`, `color`, `icon`, `premiumSubscriberRole`, `botRole` | `fetchHighest()`, `fetchHoist()`, …  | getters returning `Awaitable<Role \| null>`, read from `cache`; the `fetch*` methods are kept |
| `add(RoleResolvable \| RoleResolvable[] \| Collection, reason)`         | `add(string \| string[], reason)`    | same input as discord.js; always resolves to the updated `GuildMember`                        |
| `remove(...)`                                                           | same gap                             | same input as discord.js; always resolves to the updated `GuildMember`                        |
| `set(Collection \| RoleResolvable[], reason)`                           | `set(string[], reason)`              | same input as discord.js                                                                      |
| `clone()`                                                               | missing                              | `clone()`                                                                                     |
| `TypeError` on an invalid element / type                                | `IdUnresolvable` only                | `GatewayTypeError` with the codes `InvalidType` / `InvalidElement` (discord.js's messages)    |

Details:

- `cache` and the getters are `Awaitable`: synchronous with the default `CollectionCache` and the in-memory stores, a
  promise with an asynchronous store (Redis). This is the only deviation from discord.js, and the same rule as
  `manager.cache.get`.
- `client.roles.cache` is keyed by `resolveKey(guildId, roleId)`, so `cache` is assembled per role ID with
  `whenCachedMap` (`util/roles.ts`, `cachedRoles`) and wrapped in a `Collection`.
- `highest` is `Role | null` (discord.js: `Role`): `@everyone` may not be cached.
- `color` picks the highest role with `colors.primaryColor`, as discord.js does. The getters and their `fetch*`
  variants share the same pickers.
- A single role goes through the idempotent `PUT` / `DELETE` member-role routes and returns a clone of the member with
  the updated role IDs, never the cached instance; several roles go through `set`, which is `member.edit({ roles })`.
- `GuildMemberEditOptions.roles` and `GuildMemberAddOptions.roles` accept `RoleResolvables`
  (`readonly RoleResolvable[] | ReadonlyCollection<Snowflake, Role>`), so `member.edit({ roles })` matches discord.js.
- Roles resolve by their `id` alone: a `Role` of another guild is not rejected locally, Discord answers for it.
- Kept, not in discord.js: `guildId`, `userId`, `ids`, `fetch()` and the `fetch*` variants (they fall back to REST when
  a role is not cached). `member.roles` no longer throws for a member without a user ID; `userId` does.
- The manager stays a `BaseManager`: its `cache` is a read-only `Collection`, not a `Cache` with `set` / `delete`. To
  revisit with the scoped managers.

## `GuildEmojiRoleManager`

Reference: discord.js
[`GuildEmojiRoleManager.js`](https://github.com/discordjs/discord.js/blob/main/packages/discord.js/src/managers/GuildEmojiRoleManager.js).

- Built from the emoji, `(emoji)`, exposing `emoji` and `guild`; `guildId`, `emojiId`, `ids` and `fetch()` are kept.
- `cache: Awaitable<Collection<Snowflake, Role>>` of the cached allowed roles.
- `add` / `remove` / `set` accept `Role`s, IDs, arrays and a `Collection`; they go through `emoji.edit({ roles })` and
  resolve to the patched emoji. An invalid element throws `InvalidElement`, a single one included, as in discord.js.
- `GuildEmojiCreateOptions.roles` and `GuildEmojiEditOptions.roles` accept `RoleResolvables`.
- `clone()`.

## `UserManager`

Reference: discord.js
[`UserManager.js`](https://github.com/discordjs/discord.js/blob/main/packages/discord.js/src/managers/UserManager.js).

- `resolve` / `resolveId` / `fetch` / `send` / `createDM` / `deleteDM` / `dmChannel` accept a `UserResolvable`: a
  `User`, a `GuildMember` or `ThreadMember` (whose `id` is their user's), a `Message` (its author), or an ID. An
  unresolvable value throws `IdUnresolvable`.
- `dmChannel(user)`: the cached DM with that user, `null` when there is none. `User#dmChannel` reads it.
- `createDM(user, { cache, force })` returns the cached DM, unless it is partial or `force` is set.
  `User#createDM(force?)` and `GuildMember#createDM(force?)` forward to it.
- `deleteDM(user)` closes the cached DM and throws `UserNoDMChannel` when there is none.

### Finding the cached DM

`client.channels.cache` is not enumerable, so the lookup lives in `ChannelManager._findDM(userId)` (`@internal`), which
scans the raw channel store for a `DM` whose first recipient is the user. It answers three ways:

- the `DMChannel`;
- `null`: the cache was searched and holds none;
- `undefined`: the cache cannot be searched.

The cache is searched only when the store is **synchronous** and can enumerate its entries: `CollectionCache` (through
its store adapter) and the in-memory stores. `cache: null`, a store without iteration, and an asynchronous store such
as Redis are not searched: reading every cached channel from Redis on each `user.send()` costs more than the `POST`
that Discord answers with the existing channel.

When the cache cannot be searched, `dmChannel` is `null`, `createDM` always calls the API, and `deleteDM` keeps the
previous behaviour (`createDM`, then delete) without throwing, as whether a DM exists is unknown.

## Errors

`InvalidType`, `InvalidElement` and `UserNoDMChannel` are added to `errors/Messages.ts` with discord.js's messages.

## Breaking changes

Under 0.x, a `minor` changeset: the two role-manager constructors, the return types of `add` / `remove` / `set`,
`createDM` no longer always calling the API, and `deleteDM` throwing without a cached DM.
