# Manager API parity (sub-project B) — design draft

Date: 2026-10-01
Package: `@wolfstar/plugin-gateway`
Status: **draft**, to be completed after sub-project A (`2026-10-01-cache-core-design.md`) lands.

Scope: `GuildMemberRoleManager` (below) and `UserManager` parity (`createDM` reusing the cached DM unless `force`,
`deleteDM` requiring a cached DM, `resolve` / `resolveId` accepting `Message`, `GuildMember`, `ThreadMember`).

## `GuildMemberRoleManager` — discord.js parity

Reference: discord.js
[`GuildMemberRoleManager.js`](https://github.com/discordjs/discord.js/blob/main/packages/discord.js/src/managers/GuildMemberRoleManager.js).
The goal is that code written against discord.js keeps working with at most an added `await`.

| discord.js                                                              | Today here                           | After                                                                                         |
| ----------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------- |
| `new GuildMemberRoleManager(member)`                                    | `(client, guildId, userId, roleIds)` | `(member)`                                                                                    |
| `member`, `guild`                                                       | missing                              | `member: GuildMember`, `guild: Guild \| null` (the member's cached guild)                     |
| `cache: Collection<Snowflake, Role>`                                    | missing (`fetch(): Role[]`)          | `cache: Awaitable<Collection<Snowflake, Role>>`, `@everyone` included, uncached roles skipped |
| `highest`, `hoist`, `color`, `icon`, `premiumSubscriberRole`, `botRole` | `fetchHighest()`, `fetchHoist()`, …  | getters returning `Awaitable<Role \| null>`, read from `cache`; the `fetch*` methods are kept |
| `add(RoleResolvable \| RoleResolvable[] \| Collection, reason)`         | `add(string \| string[], reason)`    | same input as discord.js; always resolves to the updated `GuildMember`                        |
| `remove(...)`                                                           | same gap                             | same input as discord.js; always resolves to the updated `GuildMember`                        |
| `set(Collection \| RoleResolvable[], reason)`                           | `set(string[], reason)`              | same input as discord.js                                                                      |
| `clone()`                                                               | missing                              | `clone()`                                                                                     |
| `TypeError` on an invalid element / type                                | `IdUnresolvable` only                | `GatewayTypeError` with new codes `InvalidType` / `InvalidElement` (discord.js's messages)    |

Details:

- `cache` and the getters are `Awaitable`: synchronous with `createInMemoryCache`, a promise with Redis. This is the
  only deviation from discord.js, and the same rule as `manager.cache.get`.
- `highest` is `Role | null` (discord.js: `Role`): `@everyone` may not be cached.
- `color` picks the highest role with `colors.primaryColor`, as discord.js does (today: `color !== 0`).
- A single role goes through the idempotent `PUT` / `DELETE` member-role routes and returns a clone of the member with
  the updated role IDs; several roles go through `set`, which `PATCH`es the member.
- `GuildMemberEditOptions.roles` accepts `readonly RoleResolvable[] | ReadonlyCollection<Snowflake, Role>`, so
  `member.edit({ roles })` matches discord.js too.
- Kept, not in discord.js: `guildId`, `userId`, `ids`, `fetch()` and the `fetch*` variants (they fall back to REST when
  a role is not cached).
- New dependency: `@discordjs/collection` (already installed transitively through `@discordjs/core`).
- `RoleResolvable` already exists in `src/types.ts`.
