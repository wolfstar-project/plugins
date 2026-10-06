# Small manager methods (sub-project B, PR 1) — design

Date: 2026-10-06
Package: `@wolfstar/plugin-gateway`
Status: **implemented**.

First PR of issue #216 (discord.js manager parity); it refs the issue and leaves it open. Scope chosen with the user:
guild-scoped managers and the small methods only. The rest of the plan (thread, reaction and permission-overwrite
managers and the like) stays for later PRs.

## Guild-scoped managers: already on `main`

`guild.members`, `guild.roles`, `guild.presences` and `guild.voiceStates` landed in #219 (scoped `<true>` managers with
caches keyed by ID) while this PR was in progress. The thin-view design drafted here (`GuildScopedManager` and four
`*View` classes delegating to the client managers) was dropped in favour of those, and this PR carries the small
methods only.

## Small methods

| Member                                           | Behaviour                                                                                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `DataManager#valueOf()`                          | The manager's cache, like discord.js. Needed on managers only: structures already have their own.                              |
| `GuildEmojiManager#resolveIdentifier(e)`         | `GuildEmoji` → its identifier; snowflake string → the cached emoji's identifier, `null` when not cached; else `ReactionEmoji`. |
| `GuildManager#widgetImageURL(guild, s?)`         | URL of the widget image; `guild` is an ID, a `Guild` or anything with `guildId`; style defaults to `Shield`.                   |
| `GuildChannelManager#channelCountWithoutThreads` | Count of the guild's channels in the channel store, threads excluded; a `CacheRead<number>`.                                   |

Deviations from discord.js and from the plan on the issue:

- `Widget#imageURL` already existed, so `widgetImageURL` is the manager-level counterpart only.
- `resolveIdentifier` throws for a value that is neither an emoji, a snowflake nor resolvable by
  `ReactionEmoji.resolveIdentifier`, instead of returning `null`. An uncached snowflake still answers `null`.
- `channelCountWithoutThreads` has no cache of its own to count (`GuildChannelManager` is a view over
  `client.channels`), so it enumerates the raw channel store through the internal `ChannelManager#_countInGuild`. A
  store that cannot enumerate throws `CacheNotIterable`, like `listCached`; with no channel cache the count is `0`.
- `rawFetchGuildActiveThreads` is skipped: nothing here would consume it.

New error: `GuildResolve` (`GatewayTypeError`), thrown by `widgetImageURL` when the value yields no guild ID.

## Tests

`tests/guild-manager-methods.test.ts` runs the counter and `valueOf` against three clients (synchronous cache, the
default `CollectionCache`, an asynchronous store); `resolveIdentifier`, `widgetImageURL` and the non-enumerable store
have their own cases. `tests/types/guild-manager-methods.ts` is the type-level check, compiled through
`tsconfig.consumption.json`.
