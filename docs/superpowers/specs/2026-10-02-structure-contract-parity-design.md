# Structure contract parity (sub-project P1) — design

Date: 2026-10-02
Package: `@wolfstar/plugin-gateway`
Status: **draft**, awaiting review.

Source: the comparative report "strutture di discord.js e Wolfstar" (discord.js `4dc1acc`, plugins `a08f774`), which
lists where a structure of this package has the name of a discord.js member but not its contract. The parity work it
calls for is split in three sub-projects, each with its own spec, plan, PR and changeset:

| Part   | Topic                                  | Report sections | Content                                                                                                     |
| ------ | -------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------- |
| **P1** | Structure contracts                    | §1, §6, §8      | This document.                                                                                              |
| P2     | Synchronous getters and lazy relations | §3, §4          | `member.permissions`, `manageable`, `message.deletable`, … and relation getters reading the cache.          |
| P3     | Missing coverage                       | §9              | `Entitlement` / `SKU` / `Subscription` with managers; `Collector`, `MessageCollector`, `ReactionCollector`. |

Out of scope for all three: the `Interaction*` structures and `InteractionCollector` (owned by
`@wolfstar/http-framework`), the client as a constructor argument (`bindClient` covers it), and a discord.js-style
flattened `toJSON()` (§7): `toJSON()` is the API-shaped data the cache stores and `kPatch` consumes.

Scope of P1: the members whose return value or criterion differs from discord.js, and that can be aligned without
reading another cache. The goal is that code written against discord.js keeps working unchanged for these members.

## Changes

| Member                         | discord.js                               | Before                          | Now                                                     |
| ------------------------------ | ---------------------------------------- | ------------------------------- | ------------------------------------------------------- |
| `Message#react(emoji)`         | `Promise<MessageReaction>`               | `Promise<this>`                 | `Promise<MessageReaction>`                              |
| `MessageReaction#react()`      | `Promise<MessageReaction>`               | `Promise<this>`, sets `me` only | `Promise<this>`, also bumps the counts                  |
| `Message#attachments`          | `Collection<Snowflake, Attachment>`      | `Attachment[]`                  | `Collection<string, Attachment>`                        |
| `Message#stickers`             | `Collection<Snowflake, Sticker>`         | raw `APIStickerItem[]`          | `Collection<string, Sticker>`                           |
| `Message#messageSnapshots`     | `Collection<Snowflake, MessageSnapshot>` | `Message[]`                     | `Collection<string, Message>`                           |
| `ReactionManager#cache`        | `Collection<string, MessageReaction>`    | `MessageReaction[]`             | `Collection<string, MessageReaction>`                   |
| `Message#partial`              | content is no string, or no author       | no author                       | content is no string, or no author                      |
| `valueOf()` on every structure | the ID (`Base#valueOf`)                  | the object itself               | the ID when the structure has one, the object otherwise |

`Message#embeds` and `Message#components` stay arrays, as in discord.js.

### Reactions

`Message#react(emoji)`:

1. calls `client.messages.react(channelId, id, emoji)` (unchanged, `Promise<void>`);
2. computes the message's `reactions` with the bot's reaction added — a pure helper `withOwnReaction(reactions, emoji)`
   in `util/messages.ts`: when the emoji is already there with `me: true`, nothing changes (the route is idempotent);
   when it is there with `me: false`, `count` and `count_details.normal` go up by one and `me` becomes `true`;
   otherwise a new entry `{ count: 1, count_details: { normal: 1, burst: 0 }, me: true, me_burst: false,
burst_colors: [], emoji }` is appended;
3. patches this message with `kPatch({ reactions })` and the cached entry with
   `client.messages._patchCached(key, …)` using the same helper, so that a cached instance other than `this` follows
   (with `CollectionCache` they are usually the same object; the helper being idempotent on `me: true` makes the
   double application harmless);
4. returns `this.reactions.resolve(emoji)`. It cannot be `null` after step 3.

The emoji of a new entry is derived from the resolved identifier: `name:id` / `a:name:id` for a custom emoji, the
decoded unicode character otherwise. A bare snowflake resolves to `{ id, name: null }`.

discord.js does the same through its `MessageReactionAdd` action, and its `MessageReaction#_add` skips the increment
when the reaction already has `me` and the reacting user is the client. The later `MESSAGE_REACTION_ADD` dispatch for
the bot's own reaction must not count it twice here either, and `addReaction` in
`packages/plugin-cache/src/lib/reactions.ts` increments blindly today. It gets the same rule: when
`data.user_id === clientUserId`, the event is not a burst, and the cached reaction already has `me: true`, the message
is returned unchanged (likewise for `me_burst` with a burst event). This is also more correct on its own: a message
fetched over REST after the bot reacted, but before the dispatch is processed, already counts the bot.
`@wolfstar/plugin-cache` gets a `patch` changeset for it.

`MessageReaction#react()` keeps returning `this` (it already is the `MessageReaction`, as in discord.js) and delegates
to `message.react()` when it has its message, patching itself from the result; without a message it applies the same
helper to its own data.

`ReactionManager#cache` is keyed like discord.js: the emoji's ID, or its name for a unicode emoji — the value
`MessageReaction#valueOf()` already returns. `ReactionManager#resolve` keeps its signature.

### Containers

- `attachments`: `new Collection(data.attachments.map((a) => [a.id, new Attachment(a)]))`.
- `stickers`: keyed by sticker ID. Values are `Sticker` built from the sticker item (`id`, `name`, `format_type`),
  bound to the message's client, like discord.js, which builds partial `Sticker`s from `sticker_items`. `Sticker`
  getters already tolerate missing fields; any that does not is fixed to return `null`.
- `messageSnapshots`: keyed by the referenced message's ID (`message_reference.message_id`, falling back to this
  message's ID), like discord.js.

The getters keep building their value on each access, as today; memoising is not part of this change.

Internal callers are updated: `MessageReaction#fetch` (`reactions.cache.find` works on a `Collection`),
`util/dispatch.ts` (`reactions.cache ?? []` → iterates `.values()`), and the tests reading these as arrays.

### `Message#partial`

```ts
public get partial(): boolean {
  return typeof this[kData].content !== "string" || this[kData].author === undefined;
}
```

Messages built by the managers from `MESSAGE_UPDATE` payloads without content were not partial before; they are now,
and `fetch()` completes them. `UserManager` and the partial tests are checked for assumptions on the old criterion.

### `valueOf()`

`StructureMixin` gains:

```ts
public valueOf(): string | this {
  const { id } = this as { id?: unknown };
  return typeof id === "string" ? id : this;
}
```

discord.js returns `this.id` unconditionally; returning the structure when there is no string ID keeps
`Object.prototype.valueOf` semantics for structures without one (`GuildMember` with an unknown user, `VoiceState`,
`Presence`, …) rather than yielding `undefined`/`null`. Classes with their own `valueOf` (`BaseInvite`,
`MessageReaction`) keep it: `Mixin` gives precedence to members defined on the target. `flatten` in `util/Util.ts`
already reads `valueOf()` and is checked against the new behaviour by its existing tests.

## Compatibility

Breaking for consumers of `@wolfstar/plugin-gateway` (0.x, so a `minor` changeset listing each break):

- `message.attachments[0]`, `.length`, `.map(...)` returning an array → `.first()`, `.size`, `.map(...)` (still an
  array); same for `stickers`, `messageSnapshots`, `reactions.cache`.
- `message.stickers` values are `Sticker`, not raw items (`format_type` → `format`).
- `await message.react(e)` no longer returns the message.
- `message.partial` is `true` for messages without content.
- `` `${structure}` `` is unaffected (`toString` wins); `structure + ""` and `==` comparisons now use the ID.

## Testing

Tests first, in `packages/plugin-gateway/tests/`:

- `messages.test.ts`: `attachments`, `stickers`, `messageSnapshots` are `Collection`s with the expected keys and
  value classes; `partial` for content-less and author-less data.
- `reactions.test.ts`: `react()` returns a `MessageReaction` with `me: true` and the right count for a new emoji, an
  existing emoji of others, and an emoji the bot already reacted with; custom and unicode emojis; the cached message
  is patched; the bot's own `MESSAGE_REACTION_ADD` after `react()` does not double count; `reactions.cache` keys.
- `packages/plugin-cache` reactions test: `addReaction` leaves a reaction with `me: true` unchanged for the bot's own
  non-burst event, and still counts everyone else's.
- `structures` test for `valueOf()`: ID for `User`, `Message`, `Role`; the structure itself when there is no ID; the
  overrides of `BaseInvite` and `MessageReaction` are kept.
- The type-level consumption test (`tsconfig.consumption.json`) asserts the new return types.

Done means `pnpm lint`, `pnpm build`, `pnpm typecheck` and `pnpm test` pass, the README sections on messages and
reactions describe the new contracts, and `.changeset/structure-contract-parity.md` exists (`minor` for
`@wolfstar/plugin-gateway`, `patch` for `@wolfstar/plugin-cache`).
