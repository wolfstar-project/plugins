# Synchronous getters and lazy relations (sub-project P2) — design

Date: 2026-10-02
Package: `@wolfstar/plugin-gateway`
Status: **approved in conversation**, implementation in progress.

Second part of the parity work drawn from the comparative report "strutture di discord.js e Wolfstar" (§3, §4); see
`2026-10-02-structure-contract-parity-design.md` for the split in P1–P3. It covers the "lazy relations in structure
getters" half of sub-project D of `2026-10-01-cache-core-design.md`; scoped managers (`guild.members`,
`channel.messages`) and events delivering cached instances stay out.

Goal: code written against discord.js that reads `message.channel`, `member.permissions` or `member.kickable` works
unchanged with the default cache (`CollectionCache`) and with synchronous stores. Everything here is additive: no
existing signature changes, and every `fetch*` method stays.

## Rule for an asynchronous cache

Decided with the user:

- **Relation getters** (`T | null`) never throw: they return `null` when the cache is asynchronous.
- **Derived getters** (`permissions`, `manageable`, `deletable`, …) return the plain value like discord.js, and
  **throw** `GatewayError` `CacheAsynchronous` when a cache they need is asynchronous (Redis): the `fetch*` variant is
  the one to use there. `Awaitable<T>` was rejected because discord.js code would not compile unchanged, `T | null`
  because `if (member.kickable)` would silently read `null` as `false`.

## Lazy relations

Today a relation getter returns what the manager resolved when it built the structure
(`this[kRelations].guild ?? null`), so a structure built by hand, or one whose relation was not cached at the time,
answers `null` forever. Getters now resolve in this order:

1. the relation the manager resolved, when it is not `null`/`undefined`;
2. a synchronous read of the cache, through the structure's client;
3. `null`: the cache is asynchronous, the entity is not cached, the structure lacks the ID, or no client exists.

Two pieces:

- `readCached(cache, key)` in `util/cache.ts`: `undefined` when `cache.synchronous` is false, else the entry as the
  cache holds it (`peekCache`, no relation refresh; a promise-like answer counts as a miss).
- `StructureMixin#lazyRelation(name, read)`: step 1, then `read(client)` with `this[kClient]` or the container's
  client; it never throws when no client was constructed.

Reads per relation:

| Relation                      | Read                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| `guild`                       | `client.guilds._getShallow(guildId)` when synchronous (no channel hydration)           |
| `channel`, `parent`, `thread` | `client.channels.cache` by ID (it spans channels and threads)                          |
| `user`, `executor`            | `client.users.cache` by ID                                                             |
| `member`                      | `client.members.cache` by `resolveKey(guildId, userId)`                                |
| `message`                     | `client.messages.cache` by `resolveKey(channelId, messageId)`                          |
| `role`                        | `client.roles.cache` by `resolveKey(guildId, roleId)`                                  |
| `voice`, `presence` (member)  | `client.voiceStates.cache` / `client.presences.cache` by `resolveKey(guildId, userId)` |

Applied to every getter of the form `this[kRelations].x ?? null` whose structure carries the needed ID(s):
`Message` (`guild`, `channel`), `GuildMember` (`guild`, `voice`, `presence`), `Role`, `GuildEmoji`, `Sticker`,
`Webhook`, `VoiceState`, `Presence`, `StageInstance`, `GuildScheduledEvent`, `Integration`, `GuildBan`,
`GuildTemplate`, `AutoModerationRule`, `AutoModerationActionExecution`, `GuildAuditLogsEntry`, `SoundboardSound`,
`Typing`, `PermissionOverwrites`, `ThreadMember`, `MessageReaction`, `Poll`, the onboarding and welcome screen
structures, and the channel mixins (`GuildChannelMixin#guild`, `ChannelParentMixin#parent`). A getter whose structure
has no ID for the relation is left as it is. Getters with a payload fallback (`Message#author`, `Message#member`,
`GuildMember#user`, …) are unchanged: they already never answer `null` for cached-or-embedded data.

A lazily read relation is not stored back: the next access reads the cache again, so it stays as fresh as the cache.

`ChannelPermissionMixin#permissionsLocked` uses the lazy `parent`, so it stops answering `null` for an uncached-at-build
category that is in the cache.

## Derived getters

One synchronous twin, with discord.js's name, for every existing `fetch*` check:

| Structure                   | New members                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `GuildMember`               | `permissions`, `permissionsIn(channel)`, `manageable`, `kickable`, `bannable`, `moderatable`, `displayColor`, `displayHexColor` |
| `Message`                   | `editable`, `deletable`, `bulkDeletable`, `pinnable`, `crosspostable`                                                           |
| `Role`                      | `editable`, `permissionsIn(channel)`                                                                                            |
| guild channels              | `permissionsFor(target)`                                                                                                        |
| `GuildEmoji`, `GuildInvite` | `deletable`                                                                                                                     |

Behaviour:

- They only read caches, never the API.
- An asynchronous cache throws `CacheAsynchronous(entity)`. Its message becomes "The {entity} cache is asynchronous:
  use the asynchronous variant (`fetch*` methods, or await `cache.get`)".
- A needed entity missing from a synchronous cache throws, as discord.js does with `GuildUncachedMe`:
  - `GuildUncached(guildId)` — the guild (its owner ID is needed);
  - `GuildUncachedMe(guildId)` — the bot's own member;
  - `ChannelUncached(channelId)` — the channel, or a thread's parent, for `permissionsIn`.
    A member passed by ID to `permissionsFor` that is not cached throws `GuildMemberUncached(guildId, userId)`.
- Roles that are not cached are skipped, as in discord.js (`member.roles.cache`).
- Results equal the `fetch*` variants whenever everything is cached.

`GuildMember#permissions` is `Readonly<PermissionsBitField>`; `Role#permissions` already exists and is unrelated.

### Shared logic

The decision rules stay in one place. `util/permissions.ts` already has the pure `computeGuildPermissions`,
`computeChannelPermissions`, `compareRolePositions`. The rest of each check is small: it is written once as a
function taking a _reader_ and used by both variants where the rule is more than a line:

- `expectSync(value, entity)` in `util/cache.ts`: returns an `Awaitable`'s value, or throws `CacheAsynchronous` when
  it is a promise (after attaching a no-op `catch`, so nothing is left unhandled).
- `requireCached(cache, key, entity)`: `expectSync` over `peekCache`, for the synchronous variants.
- `computeTargetPermissionsSync` / `computePermissionsInSync` next to their asynchronous counterparts, sharing
  `computeChannelPermissions`.
- `GuildMember`: private `outranks(guild, me, mine, theirs)` holding the manageable rule, called by `manageable` and
  `fetchManageable`.

The synchronous variants read the bot's member with `client.members.me(guildId)` (already `Awaitable`), the member's
roles with `member.roles.cache` / `member.roles.highest` (already `Awaitable`), and guilds with `_getShallow`.

## Compatibility

Additive: new getters and methods, and relation getters that answer more often. One observable change: a relation
getter that answered `null` for a hand-built structure may now answer the cached entity. `minor` changeset for
`@wolfstar/plugin-gateway`.

## Testing

- `util`: `readCached`, `expectSync`, `requireCached` on a synchronous cache, an asynchronous one, and a miss.
- Relations: for each read of the table, a hand-built structure bound to a client finds the cached entity; with an
  asynchronous store it answers `null`; with no client constructed it answers `null` without throwing.
- Derived getters, each in three conditions: default cache (the value, equal to its `fetch*`), asynchronous store
  (`CacheAsynchronous`), missing entity (the dedicated code). Hierarchy cases for `manageable`: owner, self, bot is
  owner, higher, lower, equal position.
- Type-level consumption test: `member.permissions.has("BanMembers")`, `member.kickable`, `message.deletable`,
  `channel.permissionsFor(member).has(...)` compile without `await`.
- README: the paragraphs saying `fetchDeletable` & co. replace discord.js's getters are rewritten to present both.

Done means `pnpm build`, `pnpm typecheck`, `pnpm test` pass, `oxlint packages` is clean, the touched files are
formatted, and `.changeset/sync-getters.md` exists.
