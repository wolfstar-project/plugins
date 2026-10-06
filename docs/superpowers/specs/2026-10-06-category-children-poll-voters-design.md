# Category children and poll answer voters (sub-project B, PR 2) — design

Date: 2026-10-06
Package: `@wolfstar/plugin-gateway`
Status: **implemented**.

Second PR of issue #216 (discord.js manager parity); it refs the issue and leaves it open. PR 1 (#221) added the small
manager methods. Every file in `src/managers/` keeps `Manager` in its name, as in #219.

## `category.children`

`CategoryChannel#children` returns a `CategoryChannelChildManager`, built on access like `channel.threads`.

- It extends `BaseManager`, not `DataManager`: it owns no cache, the same choice as `GuildMemberRoleManager`.
- `cache` is read from the raw channel store each time (internal `ChannelManager#_inCategory(guildId, categoryId)`),
  keeping the entries of the guild whose `parent_id` is the category and that are not threads, then hydrating them
  through `client.channels.cache`. It is a `CacheRead<Collection<string, NonThreadGuildBasedChannel>>`: synchronous with
  a synchronous cache, a promise with an asynchronous one. A category without a guild ID, or no channel cache, gives an
  empty collection. A store that cannot enumerate throws `CacheNotIterable`, like `listCached`.
- `create(options)` calls `guild.channels.create({ ...options, parent: category.id })`. The options type omits `parent`
  and excludes `ChannelType.GuildCategory`; a category type passed anyway throws `CategoryChildCategory` before any
  request. A category without a guild ID throws `GuildResolve`.
- `resolve(child)` answers the cached channel only when it belongs to the category, else `null`; `resolveId(child)`
  is `resolveId`. `valueOf()` is the cache, and `guild` is the category's cached guild.

## `answer.voters`

`PollAnswer#voters` returns a `PollAnswerVoterManager` whose `fetch({ limit, after })` delegates to
`MessageManager#fetchPollAnswerVoters`. `PollAnswer#fetchVoters` stays and goes through it. discord.js's manager has a
`cache` of voters; this one has none, because nothing tracks them: every `fetch` reads the API (the users end up in
`client.users`).

## Deviations from the plan on the issue

- `create` takes `CategoryCreateChannelOptions` (no `parent`, no category type), and a category is also rejected at
  runtime, since the plan only said "inject `parent_id`".
- `children.cache` is derived and not a `DataManager` cache, hence no `fetch`/`refresh`.

## Tests

`tests/category-children.test.ts` runs the cache, `resolve`, `create` and the category rejection against three clients
(synchronous cache, default `CollectionCache`, asynchronous store), plus a non-enumerable store, no channel cache, no
guild ID and the voters. `tests/types/category-children.ts` is the type-level check, compiled through
`tsconfig.consumption.json`.
