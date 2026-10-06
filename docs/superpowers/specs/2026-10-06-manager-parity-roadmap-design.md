# Manager parity roadmap (issue #216, remaining work) — design

Date: 2026-10-06
Package: `@wolfstar/plugin-gateway` (plus `@wolfstar/plugin-cache` for new entity types)
Status: **draft, awaiting review**.

Roadmap for the part of tracking issue #216 (discord.js manager parity) that is not merged yet. The access paths and small
methods (#219, #221) and `category.children` / `answer.voters` (#222) are done. What is left is split into six stacked PRs,
each with tests and a `feat(plugin-gateway)` changeset. Each PR refs #216 and leaves it open; the last one closes it.
Every file in `src/managers/` keeps `Manager` in its name. This spec fixes the decisions shared by all PRs and the scope
of each; every PR still gets its own implementation plan.

## Decisions

- **Cache policy: everything goes through `plugin-cache`.** Application emojis, application commands, entitlements and
  subscriptions each get a `plugin-cache` entity type, so every process of a sharded or brokered deployment sees the
  same data. Each new entity type needs its `plugin-cache` operations and a `plugin-cache` changeset, and handlers that
  read a `before` need `DispatchStateCodecs` entries.
- **Freshness.** Entitlements and subscriptions are kept fresh by `ENTITLEMENT_*` and `SUBSCRIPTION_*` dispatches; both
  event families exist in the installed `discord-api-types` and carry full payloads. Application emojis and commands have
  no dispatch, so their cache is only as fresh as the last `fetch`/`create`/`edit`/`set`/`delete` through the manager;
  this is documented on the managers. `fetch({ force: true })` bypasses the cache, as elsewhere in the package.
- **`ClientApplication`** is a single object per client, built partial from `clientId` before `READY` and completed from
  the `READY` payload (`id`, `flags`) and `fetch()`. Its cached form goes through `plugin-cache` so other processes read
  the same data.
- **`Team` and `TeamMember`** are ported; `owner` resolves to a `User` or a `Team`.
- **Permission writes** (`set`, `add`, `remove`) take an explicit bearer `token`, sent as `Authorization: Bearer <token>`
  without the bot token, and throw `ApplicationCommandPermissionsTokenMissing` without it. `fetch` and `has` use the bot
  token.
- **`ApplicationCommandManager#set()`** is ported in full. It is a bulk overwrite and replaces commands registered by
  `@wolfstar/http-framework`; the JSDoc and the package docs say so and advise not mixing the two.
- **Roles and channels in permission options** are accepted as IDs and structures only. With an asynchronous cache a
  synchronous guild-cache lookup is impossible, so unlike discord.js nothing is resolved through the guild caches.
- **Out of scope** (unchanged from the issue): interaction structures, resolvers, builders and collectors; signature-level
  parity of the cache API; event coverage beyond what each manager needs to stay fresh.

## PR 1 — `GuildManager#fetchSoundboardSounds(guildIds)`

Gateway opcode 31 (`REQUEST_SOUNDBOARD_SOUNDS`) for the sounds of several guilds, answered by the existing
`SoundboardSounds` dispatch in `util/dispatch.ts`. It follows the `GuildMemberManager#request` template: shard ID derived
from each guild ID, send, timeout armed after the send, settle from the dispatch. Result: a `Collection` of sounds per
guild ID. New errors in `errors/Messages.ts` and `util/errors.ts` (timeout, no shard). `rawFetchGuildActiveThreads` is
not added: `ChannelThreadManager#fetchActive` covers the public part and nothing consumes a raw variant.

## PR 2 — `ClientApplication` (#208)

- Structures: `Application` (`id`, `name`, `description`, `icon`, `iconURL()`, `coverURL()`, `createdTimestamp`,
  `createdAt`, `toString()`), `ClientApplication` (`flags`, `tags`, `installParams`, `integrationTypesConfig`,
  `customInstallURL`, `owner`, `botPublic`, `botRequireCodeGrant`, `guildId`/`guild`, `approximateGuildCount`,
  `approximateUserInstallCount`, `interactionsEndpointURL`, `roleConnectionsVerificationURL`, `eventWebhooksURL`,
  `eventWebhooksStatus`, `eventWebhooksTypes`, `partial`), `Team`, `TeamMember`.
- `client.application`, with the methods `fetch()` (`GET /applications/@me`), `edit()` (`PATCH /applications/@me`),
  `fetchRoleConnectionMetadataRecords()` and `editRoleConnectionMetadataRecords()`.
- Manager slots for `commands`, `emojis`, `entitlements` and `fetchSKUs()` are left unimplemented here and filled by
  PRs 3 to 5.
- `plugin-cache`: entity type for the application and its team.
- Open check: whether `@wolfstar/http-framework` already exposes application data (ID, public key) that should be reused
  instead of duplicated.

## PR 3 — `ApplicationEmoji` and `ApplicationEmojiManager` (#207)

`ApplicationEmoji` shares the `Emoji` base with `GuildEmoji`: `id`, `name`, `animated`, `managed`, `requiresColons`,
`available`, `author`, `application`, `edit()`, `setName()`, `delete()`, `fetchAuthor()` and `equals()`. `equals()` follows
the #203 convention: against an emoji it compares `animated`, `id`, `name`, `managed`, `requiresColons`, `available`;
against a raw emoji, `id` and `name`; a foreign argument gives `false`. `ApplicationEmojiManager`
(`client.application.emojis`): `create()`, `fetch(id?)`, `edit()`, `delete()`, `fetchAuthor()` over
`/applications/{id}/emojis`. Cached through a new `plugin-cache` entity type.

## PR 4 — `ApplicationCommand` and its managers (#207, #209)

The structure and the managers ship together because `edit()`/`delete()` go through the manager and the manager returns
the structure.

- `ApplicationCommand`: name and description with localizations, type, options, default member permissions, NSFW,
  integration types, contexts, handler, version, guild ID, `edit()`, the `set*()` helpers, `delete()`,
  `equals(command, enforceOptionOrder?)` and static `optionsEqual()`.
- `ApplicationCommandManager` (`client.application.commands`): `fetch`, `create`, `set`, `edit`, `delete`, `permissions`,
  `commandPath`, static `transformCommand` (also accepts a builder through `toJSON()`), plus the resolvable and fetch
  option types.
- `GuildApplicationCommandManager` (`guild.commands`): the same manager with the guild fixed, and its own `permissions`.
- `ApplicationCommandPermissionsManager`, reachable from `application.commands.permissions`, `guild.commands.permissions`
  and `command.permissions`: `fetch`, `set`, `add`, `remove`, `has`, `permissionsPath`, the permission types and the
  `@everyone` / "all channels" constants derived from the guild ID.
- Errors: `ApplicationCommandPermissionsTokenMissing`, `GlobalCommandPermissions`, and the `InvalidType`/`InvalidElement`
  type errors for bad resolvables.
- Events: check whether `applicationCommandPermissionsUpdate` is already emitted and with which payload; keep the
  permissions cache fresh from `APPLICATION_COMMAND_PERMISSIONS_UPDATE`.

## PR 5 — Monetization

- Structures: `Entitlement`, `SKU`, `Subscription`.
- `EntitlementManager` (`client.application.entitlements`): `fetch()` (one, or many with `userId`, `skuIds`,
  `excludeEnded`, `excludeDeleted`, `guildId`, `before`/`after`/`limit`), `createTest()`, `deleteTest()`, `consume()`.
- `SubscriptionManager` (`sku.subscriptions`): `fetch()` (one by ID, or the SKU's subscriptions with `userId`,
  `before`/`after`/`limit`). `client.application.fetchSKUs()` fills the slot left by PR 2.
- `plugin-cache` entity types for entitlements and subscriptions; `ENTITLEMENT_CREATE/UPDATE/DELETE` and
  `SUBSCRIPTION_CREATE/UPDATE/DELETE` handlers update them, with `DispatchStateCodecs` entries where a `before` is read.
  The existing `EntitlementResolvable` type is reused.
- Depends on PR 2 (`ClientApplication`).

## PR 6 — Verification pass

Each finding becomes a fix or a documented difference.

- **Thread options.** `ChannelThreadManager#create` stays one shared class. It rejects forum-only options (`message`,
  `appliedTags`) on text channels at runtime instead of silently ignoring them, and the forum and text option sets are
  typed as overloads where that is cheap. Remaining differences from discord.js's `GuildTextThreadManager` /
  `GuildForumThreadManager` split are documented.
- **DM behaviour.** Tests that `ChannelMessageManager` behaves like `DMMessageManager` and
  `PartialGroupDMMessageManager` on DM and group DM channels, including the guild-only paths and the missing `crosspost`.
- **Typings.** Confirm `crosspost` and `createMessage` typings match discord.js.

## Order and dependencies

PR 1 and PR 6 are independent of the rest. PR 2 comes before 3, 4 and 5. Stacking: 1 → 2 → 3 → 4 → 5 → 6. PRs 3 and 4 are
independent of each other after PR 2.

## Tests

Each PR adds its own `tests/*.test.ts` run against a synchronous cache, the default `CollectionCache` and an asynchronous
store, as in #222, plus a `tests/types/*.ts` consumption check compiled through `tsconfig.consumption.json`. The PRs that
add `plugin-cache` entity types add tests for the new operations in `plugin-cache`.
