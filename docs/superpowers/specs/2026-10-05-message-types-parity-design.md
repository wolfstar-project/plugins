# `Message` type parity with discord.js — design

Date: 2026-10-05
Package: `@wolfstar/plugin-gateway`
Status: **decisions taken 2026-10-05, awaiting approval of the written spec** (see "Decisions").

Reference: discord.js 14.27 `typings/index.d.ts`, `class Message<InGuild extends boolean = boolean>` (L2216),
`PartialMessage` (L7092), `MessageSnapshot` (L6786), `OmitPartialGroupDMChannel` (L5545), plus the bodies in
`src/structures/Message.js`. Builds on `bulk-delete-discordjs-parity` (which introduced `PartialMessage` and
`Message#isPartial()` as an intersection type) and on the parity decisions of `2026-10-02-sync-getters-design.md`.

Goal: code written against the discord.js `Message` types compiles unchanged against `@wolfstar/plugin-gateway`'s
`Message`: the same generic, the same narrowing, the same method signatures and the same members, wherever the data
exists in `discord-api-types` and the sub-systems exist in this package.

## Scope

Chosen with the user (2026-10-05): **types plus the missing members that need no new sub-system**.

In scope:

- the `InGuild` generic and what it narrows;
- `PartialMessage` as a `Partialize` of `Message`, and `Message#partial` typed `false`;
- `MessageSnapshot` as a type, and `messageSnapshots` returning it;
- `OmitPartialGroupDMChannel` on the return types that carry it in discord.js;
- signature gaps: `fetch(force?)`, `forward(channel)`;
- missing members: `sharedClientTheme`, `resolveComponent()`, `fetchWebhook()`.

Out of scope, with the reason:

| discord.js member                                                                                       | Reason                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `awaitReactions`, `createReactionCollector`, `createMessageComponentCollector`, `awaitMessageComponent` | Need `Collector` classes: sub-project P3, not started.                                                                                                                                                      |
| `resolved` (`CommandInteractionResolvedData`)                                                           | Belongs to interactions, excluded by `gateway-parity-scope`.                                                                                                                                                |
| `groupActivityApplication` (`ClientApplication`)                                                        | `discord-api-types` has no `group_activity_application` field on `APIMessage`, and there is no `ClientApplication` structure.                                                                               |
| `equals(message, rawData?)`                                                                             | `equals` is a convention of many discord.js structures, not of `Message` alone: tracked for all of them in [#203](https://github.com/wolfstar-project/plugins/issues/203). `Message#equals` stays as it is. |
| `_cacheType`, `_patch`, the private constructor                                                         | Private in discord.js.                                                                                                                                                                                      |

Everything else of `Message` already exists (see "Already at parity" below).

## Already at parity

`activity`, `applicationId`, `attachments`, `author`, `bulkDeletable`, `channel`, `channelId`, `cleanContent`,
`components`, `content`, `createdAt`, `createdTimestamp`, `crosspost`, `crosspostable`, `deletable`, `delete`, `edit`,
`editable`, `editedAt`, `editedTimestamp`, `embeds`, `fetchReference`, `flags`, `guild`, `guildId`, `hasThread`, `id`,
`inGuild`, `interactionMetadata`, `member`, `mentions`, `nonce`, `partial`, `pin`, `pinnable`, `pinned`, `poll`,
`position`, `react`, `reactions`, `reference`, `removeAttachments`, `reply`, `roleSubscriptionData`, `startThread`,
`stickers`, `suppressEmbeds`, `system`, `thread`, `toJSON`, `toString`, `tts`, `type`, `unpin`, `url`, `webhookId`,
`call`, `messageSnapshots` (value, not type).

## The `InGuild` generic

```ts
export class Message<InGuild extends boolean = boolean> extends BaseMessage<""> { … }
```

A **type-level** parameter only: no runtime branch, no extra field. `If<Value, TrueResult, FalseResult = null>` is added
to `src/types.ts` with discord.js' definition.

| Member      | Type                                                                                     |
| ----------- | ---------------------------------------------------------------------------------------- |
| `guildId`   | `If<InGuild, string>` (`string` when in guild, `null` otherwise; today `string \| null`) |
| `guild`     | `If<InGuild, Guild \| null, null>`                                                       |
| `channel`   | `If<InGuild, GuildTextBasedChannel, TextBasedChannel> \| null`                           |
| `mentions`  | `MessageMentions<InGuild>`                                                               |
| `inGuild()` | `this is Message<true>`                                                                  |

`GuildTextBasedChannel` is new in `src/types.ts` (`TextBasedChannel` minus `DMChannel` and `GroupDMChannel`); the
existing `TextBasedChannel` and `TextBasedChannelResolvable` stay.

`MessageMentions<InGuild>` narrows only `guild` (`If<InGuild, Guild | null, null>`): `members` and `channels` here are
arrays and maps resolved from payload data and the cache, so they keep their types.

**Deliberate divergence, to review.** discord.js types `guild` as `Guild` and `channel` as the channel for
`Message<true>`, because its cache is always synchronous and complete. Here the relation getters answer `null` when
the entity is uncached or the cache is asynchronous (decision of the sync-getters spec, "Relation getters answer null
on Redis"). The spec keeps `| null` on `guild` and `channel` so that the types stay honest, and makes `guildId`, which
is data, exact. If the user prefers discord.js' exact types, `guild`/`channel` become `If<InGuild, Guild>` and
`If<InGuild, GuildTextBasedChannel, TextBasedChannel>`, and the hazard is documented the way `GatewayCacheConfig`
documents it for the derived getters.

Where a `Message` is produced, its generic is the best the code knows: `MessageManager` returns `Message` (default,
`boolean`), and events keep `Message`. `message.inGuild()` is the way to narrow, as in discord.js.

## `PartialMessage` and `partial`

Today: `PartialMessage = Message & { readonly partial: true }` plus `Message#isPartial(): this is PartialMessage`.
discord.js: `Message#partial` is the literal type `false`, and

```ts
export interface PartialMessage<InGuild extends boolean = boolean> extends Partialize<
  Message<InGuild>,
  "pinned" | "system" | "tts" | "type", // nulled
  "author" | "cleanContent" | "content" // nullable
> {}
```

so that `if (message.partial)` narrows `Message | PartialMessage`, and a partial's `content`, `author`, `cleanContent`
are `null`/`T | null` in the type.

Decision: **adopt the discord.js shape.**

- Add `Partialize` and `AllowedPartial` to `src/types.ts`, like discord.js.
- `PartialMessage<InGuild>` is the `Partialize` above, exported from `structures/messages/Message.ts`.
- `Message#partial` is typed `false`. At runtime it is still computed (`content` not a string, or no `author`); the
  getter returns it cast to `false`, with a one-line comment: the class type describes a complete message, the union
  `Message | PartialMessage` is where a partial one shows up, exactly as in discord.js.
- `Message#isPartial()` is **dropped**: it was added by the unreleased `bulk-delete-discordjs-parity` branch, never
  published, and a `this is PartialMessage` predicate can not hold once `PartialMessage` stops being a subtype of
  `Message`. `GuildMember#isPartial()` (published by #201) is untouched.
- Every place that returned `Message | PartialMessage` already says so (`bulkDelete`, `_partial`); `_partial` keeps
  its cast. `PartialMessage` stops being assignable to `Message`, which is the point.

This is a type-level breaking change for code written against `PartialMessage`/`isPartial()` of the unreleased
branch only; nothing published changes, so it needs no extra changeset entry beyond the bulk-delete one (which is
reworded to drop `isPartial`).

## `MessageSnapshot`

```ts
export interface MessageSnapshot extends Partialize<
  Message,
  null,
  Exclude<
    keyof Message,
    | "attachments"
    | "client"
    | "components"
    | "content"
    | "createdTimestamp"
    | "editedTimestamp"
    | "embeds"
    | "flags"
    | "mentions"
    | "stickers"
    | "type"
  >
> {}
```

`messageSnapshots` becomes `Collection<string, MessageSnapshot>`. The runtime stays what it is (a `Message` carrying
the ID of the forwarded message): a snapshot has no author, so its `partial` is already `true`, which agrees with
`Partialize`'s `partial: true`. Only the declared type changes.

## `OmitPartialGroupDMChannel`

```ts
export type OmitPartialGroupDMChannel<Structure extends { channel: AnyChannel | null }> =
  Structure & { channel: Exclude<Structure["channel"], GroupDMChannel> };
```

Applied, as in discord.js, to the resolved value of: `delete`, `edit`, `fetchReference`, `crosspost`, `fetch`, `pin`,
`removeAttachments`, `reply`, `forward`, `suppressEmbeds`, `unpin`.

Here `GroupDMChannel` keeps `send` (verified by the bulk-delete tests), so the type changes nothing for sending; it
exists so that user code written with `OmitPartialGroupDMChannel<Message>` compiles, and so that
`message.channel` of a reply never has to be narrowed against group DMs. `PartialGroupDMChannel` of discord.js has no
counterpart here; the exclusion targets `GroupDMChannel`.

Implementation: methods that return `this` today (`edit`, `delete`, `pin`, `unpin`, `crosspost`,
`suppressEmbeds`, `removeAttachments`, `fetch`) keep returning the same instance and declare the new type through a
cast at the return statement. The cast is sound because the runtime channel never changes.

## Signature gaps

- `fetch(force = true)`. discord.js: `this.channel.messages.fetch({ message: this.id, force })`. Today `fetch()`
  always forces. With `force: false` and a cached copy it patches this instance from the cache and skips the request;
  `fetch()` with no argument is unchanged.
- `forward(channel: Exclude<TextBasedChannelResolvable, GroupDMChannel>)`. Today `forward(channelId: string)`. A channel
  object or its ID, resolved with `resolveId`. A string still works.

## Missing members

- `sharedClientTheme: SharedClientTheme | null`. `APIMessage#shared_client_theme` is in `discord-api-types` v10.
  A transformer in `util/Transformers.ts`, like the other camel-cased payloads, producing
  `{ colors, gradientAngle, baseMix, baseTheme? }` (`baseTheme` only when the payload has `base_theme`, as in
  discord.js); `null` when absent. `SharedClientTheme` is exported.
- `resolveComponent(customId: string): MessageActionRowComponent | null`. discord.js:
  `findComponentByCustomId(this.components, customId)`; that helper already exists in `util/components.ts` and
  `MessageActionRowComponent` is the existing interactive-component union (confirmed in the plan).
- `fetchWebhook(): Promise<Webhook>`. Throws `WebhookMessage` when `webhookId` is `null` and `WebhookApplication`
  when `webhookId === applicationId`, then `client.fetchWebhook(webhookId)` (exists). Two new codes in
  `errors/Messages.ts`, with discord.js' texts: "The message was not sent by a webhook." and "This message webhook
  belongs to an application and cannot be fetched."

## Compatibility

- Runtime: additive except `forward`, which widens its parameter. `isPartial` disappears but was never published.
  `equals` is untouched.
- Types: `Message` becomes generic with a default, so every existing `Message` reference compiles. `PartialMessage` is
  no longer a `Message`; `guildId` narrows through `inGuild()`; `messageSnapshots` yields `MessageSnapshot`.
- Changeset: `minor` for `@wolfstar/plugin-gateway` (0.x), listing the new members and the type changes above. The
  `bulk-delete-discordjs-parity` changeset is edited to drop `Message#isPartial()`.
- README: the `Message` paragraph gains the generic, `PartialMessage` and the new members; the `isPartial()` mention
  is removed.

## Testing

- `tests/types/message-parity.ts` (type-level, run by `pnpm typecheck` through `tsconfig.consumption.json`):
  - `Message<true>#guildId` is `string`, `Message<false>#guildId` is `null`; `message.inGuild()` narrows to
    `Message<true>`;
  - `Message | PartialMessage` narrows on `partial` (`content` is `string` vs `string | null`), and `PartialMessage`
    is not assignable to `Message`;
  - `OmitPartialGroupDMChannel<Message>` on `reply()`/`edit()`;
  - `messageSnapshots` values are `MessageSnapshot`;
  - `forward` accepts an ID and a channel, not a `GroupDMChannel`;
  - `@ts-expect-error` for removed `isPartial` is **not** added (removed APIs are not asserted).
- `tests/messages.test.ts` (runtime): `fetch(false)` hits the cache and skips the request, `fetch()` still forces;
  `forward` with a channel and an ID;
  `sharedClientTheme` with and without `base_theme`, and `null` when absent; `resolveComponent` finds a nested
  component and returns `null` otherwise; `fetchWebhook` throws both errors and fetches otherwise.
- Existing `bulkDelete` tests move from `isPartial()` to `partial`.
- `pnpm lint`, `pnpm build`, `pnpm typecheck`, `pnpm test` pass; `pnpm run docs` still builds.

## Decisions

1. **`guild`/`channel` nullability** on `Message<true>`: keep `| null` (approved by the user). `guildId` is exact.
2. **`isPartial()` is removed from `Message`**; callers narrow with `message.partial` on `Message | PartialMessage`.
   `Message#partial` is typed `false` and `PartialMessage#partial` is `true` (approved by the user).
3. **`equals` is out of this spec** (user, 2026-10-05): it exists on most discord.js structures, so it is off-topic
   for `Message` alone and is tracked across structures in
   [#203](https://github.com/wolfstar-project/plugins/issues/203).
