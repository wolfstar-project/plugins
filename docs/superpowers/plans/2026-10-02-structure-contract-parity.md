# Structure Contract Parity (P1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the `@wolfstar/plugin-gateway` structure members that share a name with discord.js the same return values: `react()`, the `Collection` containers of `Message`, `Message#partial`, and `valueOf()`.

**Architecture:** Every change is local to a structure getter or method; no cache read is added. `Message#react` patches the message (and its cached entry) with a pure helper, and `addReaction` in `@wolfstar/plugin-cache` stops counting the bot's own reaction twice when the gateway echoes it.

**Tech Stack:** TypeScript 7, `@discordjs/collection`, `@discordjs/structures`, vitest, pnpm + Turborepo, changesets.

**Spec:** `docs/superpowers/specs/2026-10-02-structure-contract-parity-design.md`

## Global Constraints

- Branch: `feat/structure-contract-parity` (already created, holds the spec commit).
- Only `packages/plugin-gateway` and `packages/plugin-cache` (`src/lib/reactions.ts` and its test) change, plus `.changeset/` and `docs/`.
- `Message#embeds` and `Message#components` stay arrays.
- `client.messages.react()` keeps returning `Promise<void>`.
- `ReactionManager#resolve` keeps its signature.
- Getters keep building their value on each access; no memoisation.
- Commit messages follow Conventional Commits (commitlint hook). Never use `--no-verify`.
- Test names follow the repo's `GIVEN … THEN …` style.
- Run tests from the repo root: `pnpm vitest run <path>`. Run `pnpm build` once before the first gateway test if `packages/plugin-cache/dist` is missing or stale (gateway imports the built `@wolfstar/plugin-cache`); rebuild after Task 1.
- Done: `pnpm lint`, `pnpm build`, `pnpm typecheck`, `pnpm test` all pass.

## Review Focus

1. The bot reacts with an emoji it already reacted with (`me: true`): the count must not change, and `react()` still returns the reaction. — tested in Task 5.
2. The gateway echoes the bot's own `MESSAGE_REACTION_ADD` after `react()`: the count must not double. — tested in Task 1 (cache) and Task 5 (end to end).
3. `react()` on a message built by hand, absent from the cache: no throw, the returned reaction has `count: 1`. — tested in Task 5.
4. A message with two reactions sharing a unicode name vs. a custom emoji named the same: `reactions.cache` keys must not collide (custom is keyed by ID). — tested in Task 3.
5. A structure without a string `id` (`GuildMember` whose payload lacks `user`): `valueOf()` must return the structure, not `null`. — tested in Task 2.

---

### Task 1: `addReaction` ignores the bot's own echoed reaction

**Files:**

- Modify: `packages/plugin-cache/src/lib/reactions.ts:26-68`
- Test: `packages/plugin-cache/tests/operations.test.ts` (inside `describe("reactions and poll votes")`, line ~267)

**Interfaces:**

- Produces: `addReaction(message, data, clientUserId)` returns `message` unchanged (same reference) when the event's user is the bot and the cached reaction already has `me` (non-burst event) or `me_burst` (burst event).

- [ ] **Step 1: Read the existing reaction tests**

Read `packages/plugin-cache/tests/operations.test.ts` lines 267–330 to reuse its fixture helpers (how it creates the cache, the message key, and dispatches `MESSAGE_REACTION_ADD` with a `clientUserId`). The new test must use the same helpers.

- [ ] **Step 2: Write the failing unit test**

Add a direct unit test of the pure function (it needs no fixture). Append to `packages/plugin-cache/tests/operations.test.ts`, importing `addReaction` from `"../src/lib/reactions.js"`:

```ts
describe("addReaction", () => {
  const bot = "266624760782258186";
  const emoji = { id: null, name: "🐺" };
  const base = { id: "30", channel_id: "20" } as APIMessage;
  const event = (userId: string, burst = false) =>
    ({ user_id: userId, channel_id: "20", message_id: "30", emoji, burst, type: 0 }) as never;

  test("GIVEN the bot's own reaction already counted THEN the message is returned unchanged", () => {
    const message = {
      ...base,
      reactions: [
        {
          emoji,
          count: 1,
          count_details: { normal: 1, burst: 0 },
          me: true,
          me_burst: false,
          burst_colors: [],
        },
      ],
    } as APIMessage;

    expect(addReaction(message, event(bot), bot)).toBe(message);
  });

  test("GIVEN someone else's reaction on an emoji the bot reacted with THEN it is counted", () => {
    const message = addReaction(addReaction(base, event(bot), bot), event("1"), bot);

    expect(message.reactions?.[0]).toMatchObject({ count: 2, me: true });
  });

  test("GIVEN the bot's burst reaction on an emoji it reacted normally with THEN it is counted", () => {
    const message = addReaction(addReaction(base, event(bot), bot), event(bot, true), bot);

    expect(message.reactions?.[0]).toMatchObject({
      count: 2,
      count_details: { normal: 1, burst: 1 },
      me: true,
      me_burst: true,
    });
  });
});
```

Add `APIMessage` to the file's `discord-api-types/v10` type import if it is not there.

- [ ] **Step 3: Run it and see the first test fail**

Run: `pnpm vitest run packages/plugin-cache/tests/operations.test.ts -t addReaction`
Expected: the first test FAILS (`count` became 2, a new object is returned); the other two pass.

- [ ] **Step 4: Implement**

In `packages/plugin-cache/src/lib/reactions.ts`, extend the JSDoc of `addReaction` and add the guard right after `existing` is computed:

```ts
/**
 * Adds a `MESSAGE_REACTION_ADD` to a cached message's reactions.
 *
 * @remarks
 * The bot's own reaction is not counted again when the cached reaction already has it (`me`, or `me_burst` for a
 * super reaction): the message was fetched, or patched by the reacting client, after the bot reacted.
 *
 * @param message The cached message.
 * @param data The dispatch data.
 * @param clientUserId The bot's user ID, to set `me` when the bot reacted.
 */
```

```ts
const existing = reactions.find((reaction) => isSameEmoji(reaction.emoji, data.emoji));
if (existing && me && (data.burst ? existing.me_burst : existing.me)) return message;
```

- [ ] **Step 5: Run the whole cache suite**

Run: `pnpm vitest run packages/plugin-cache`
Expected: PASS, including the existing "counts and me flag follow" test.

- [ ] **Step 6: Rebuild the cache package and commit**

```bash
pnpm turbo run build --filter=@wolfstar/plugin-cache
git add packages/plugin-cache/src/lib/reactions.ts packages/plugin-cache/tests/operations.test.ts
git commit -m "fix(plugin-cache): do not count the bot's own reaction twice"
```

---

### Task 2: `valueOf()` returns the ID

**Files:**

- Modify: `packages/plugin-gateway/src/structures/Structure.ts` (class `StructureMixin`, after the `client` getter)
- Test: `packages/plugin-gateway/tests/structures.test.ts` (inside `describe("Structure")`, line ~32)

**Interfaces:**

- Produces: `StructureMixin#valueOf(): string | this`.

- [ ] **Step 1: Write the failing tests**

Add to `describe("Structure", …)` in `packages/plugin-gateway/tests/structures.test.ts`. Import `GuildMember`, `Message`, `MessageReaction`, `Role`, `User` from `"../src/index.js"` if they are not imported yet:

```ts
test("GIVEN a structure with an ID THEN valueOf is the ID", () => {
  const user = new User({ id: "1", username: "wolf" } as never);
  const role = new Role({ id: "2", guild_id: "10", name: "pack" } as never);
  const message = new Message({ id: "3", channel_id: "20" } as never);

  expect(user.valueOf()).toBe("1");
  expect(role.valueOf()).toBe("2");
  expect(message.valueOf()).toBe("3");
  expect(`${user}` === "1").toBe(false); // toString still wins in templates
  expect(user == ("1" as never)).toBe(true);
});

test("GIVEN a structure without an ID THEN valueOf is the structure", () => {
  const member = new GuildMember({ guild_id: "10", roles: [] } as never);

  expect(member.id).toBeNull();
  expect(member.valueOf()).toBe(member);
});

test("GIVEN a structure defining its own valueOf THEN it is kept", () => {
  const reaction = new MessageReaction({
    channel_id: "20",
    message_id: "30",
    emoji: { id: null, name: "🐺" },
  } as never);

  expect(reaction.valueOf()).toBe("🐺");
});
```

If oxlint rejects `==` (`eqeqeq`), replace that line with `expect(Number.isNaN(Number(user))).toBe(false);`.

- [ ] **Step 2: Run and see them fail**

Run: `pnpm vitest run packages/plugin-gateway/tests/structures.test.ts -t valueOf`
Expected: the first test FAILS (`valueOf()` returns the object); the other two pass.

- [ ] **Step 3: Implement**

In `packages/plugin-gateway/src/structures/Structure.ts`, inside `StructureMixin`, after the `client` getter:

```ts
  /**
   * The ID of this structure, like discord.js's `Base#valueOf`, so that structures compare and sort by ID. Structures
   * without an ID (a member whose user is unknown, a voice state, ...) are their own value.
   */
  public valueOf(): string | this {
    const { id } = this as { id?: unknown };
    return typeof id === "string" ? id : this;
  }
```

`Mixin()` copies prototype members and lets members defined on the target win, so `BaseInvite#valueOf` and `MessageReaction#valueOf` are kept. If a `@discordjs/structures` base class declares its own `valueOf` (e.g. a bitfield-like `valueOf(): bigint`) and typecheck reports a conflict in the `interface X extends StructureMixin<…>` merge, that class already has a meaningful `valueOf`: leave its runtime alone and widen only the type by adding `valueOf` to the class's own declaration.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run packages/plugin-gateway/tests/structures.test.ts packages/plugin-gateway/tests/util.test.ts packages/plugin-gateway/tests/serializers.test.ts`
Expected: PASS. `util`/`serializers` cover `flatten`, which reads `valueOf()`: a structure nested in a flattened object now serialises as its ID, which is discord.js's behaviour. If one of those tests asserted the old nested-object output, update the assertion to the ID.

- [ ] **Step 5: Typecheck and commit**

```bash
pnpm typecheck
git add packages/plugin-gateway/src/structures/Structure.ts packages/plugin-gateway/tests
git commit -m "feat(plugin-gateway): structures are valued by their ID"
```

---

### Task 3: `Collection` containers

**Files:**

- Modify: `packages/plugin-gateway/src/structures/messages/Message.ts` (`attachments` l.189, `stickers` l.208, `messageSnapshots` l.265, `equals`)
- Modify: `packages/plugin-gateway/src/managers/ReactionManager.ts` (`cache`, `resolve`)
- Modify: `packages/plugin-gateway/src/structures/messages/MessageReaction.ts` (`fetch`, l.161)
- Modify: `packages/plugin-gateway/src/util/dispatch.ts` (l.320-330, `MessageReactionRemoveAll`)
- Modify: `packages/plugin-gateway/src/util/events.ts` (l.212-216, `messageReactionRemoveAll`)
- Test: `packages/plugin-gateway/tests/messages.test.ts`, `reactions.test.ts`, `partials.test.ts`, `relations-messages.test.ts`, `serializers.test.ts`

**Interfaces:**

- Produces:
  - `Message#attachments: Collection<string, Attachment>`
  - `Message#stickers: Collection<string, Sticker>`
  - `Message#messageSnapshots: Collection<string, Message>`
  - `ReactionManager#cache: Collection<string, MessageReaction>`, keyed by `reaction.valueOf()` (emoji ID, else name)
  - event `messageReactionRemoveAll: [message: Message | null, reactions: Collection<string, MessageReaction>, data]`

- [ ] **Step 1: Write the failing tests**

In `packages/plugin-gateway/tests/messages.test.ts`, add `Collection` (from `@discordjs/collection`) and `Sticker`, `MessageReferenceType` to the imports, then add inside `describe("Message")`:

```ts
test("GIVEN attachments, stickers and snapshots THEN they are Collections keyed by ID", () => {
  createClient();
  const msg = new Message(
    message({
      attachments: [
        {
          id: "1",
          filename: "wolf.png",
          size: 10,
          url: "https://cdn.discordapp.com/wolf.png",
          proxy_url: "https://media.discordapp.net/wolf.png",
        },
      ],
      sticker_items: [{ id: "5", name: "howl", format_type: 1 }],
      message_reference: {
        type: MessageReferenceType.Forward,
        channel_id: "200000000000000201",
        message_id: "700000000000000702",
      },
      message_snapshots: [{ message: { content: "awoo" } as never }],
    }) as never,
  );

  expect(msg.attachments).toBeInstanceOf(Collection);
  expect(msg.attachments.get("1")).toBeInstanceOf(Attachment);
  expect(msg.stickers).toBeInstanceOf(Collection);
  expect(msg.stickers.get("5")).toBeInstanceOf(Sticker);
  expect(msg.stickers.get("5")?.name).toBe("howl");
  expect(msg.stickers.get("5")?.format).toBe(1);
  expect(msg.messageSnapshots).toBeInstanceOf(Collection);
  expect(msg.messageSnapshots.get("700000000000000702")?.content).toBe("awoo");
});

test("GIVEN no attachments or stickers THEN the Collections are empty", () => {
  const msg = new Message({ id: "3", channel_id: channelId } as never);

  expect(msg.attachments.size).toBe(0);
  expect(msg.stickers.size).toBe(0);
  expect(msg.messageSnapshots.size).toBe(0);
});

test("GIVEN a unicode and a custom reaction with the same name THEN reactions.cache keys them apart", () => {
  const counts = {
    count: 1,
    count_details: { normal: 1, burst: 0 },
    me: false,
    me_burst: false,
    burst_colors: [],
  };
  const msg = new Message(
    message({
      reactions: [
        { ...counts, emoji: { id: null, name: "wolf" } },
        { ...counts, emoji: { id: "123456789012345678", name: "wolf" } },
      ],
    }),
  );

  expect(msg.reactions.cache).toBeInstanceOf(Collection);
  expect([...msg.reactions.cache.keys()]).toEqual(["wolf", "123456789012345678"]);
});
```

Update the existing assertions that treat these as arrays:

- `messages.test.ts:116` → `expect(msg.attachments.first()).toBeInstanceOf(Attachment);`
- `messages.test.ts:119` → `expect(msg.reactions.cache.size).toBe(1);`
- `partials.test.ts:105` → `expect(message!.attachments.size).toBe(0);`
- `reactions.test.ts:160` → `expect(message?.reactions.cache.size).toBe(0);`
- `reactions.test.ts` line above it → `expect(removed.map((r) => r.emoji.name)).toEqual(["🐺"]);` stays (`Collection#map` returns an array).
- `relations-messages.test.ts:247` → `const [custom, unicode] = resolved.reactions.cache.values();`
- `serializers.test.ts:482` → `const snapshot = msg.messageSnapshots.first();`

- [ ] **Step 2: Run and see them fail**

Run: `pnpm vitest run packages/plugin-gateway/tests/messages.test.ts packages/plugin-gateway/tests/reactions.test.ts packages/plugin-gateway/tests/partials.test.ts packages/plugin-gateway/tests/relations-messages.test.ts packages/plugin-gateway/tests/serializers.test.ts`
Expected: FAIL — `toBeInstanceOf(Collection)`, `.first`/`.size`/`.get` undefined.

- [ ] **Step 3: Implement the `Message` getters**

In `packages/plugin-gateway/src/structures/messages/Message.ts` add the imports:

```ts
import { Collection } from "@discordjs/collection";
import { Sticker } from "../stickers/Sticker.js";
```

(If importing `Sticker` creates an import cycle that breaks at runtime — a `ReferenceError` on load in the tests — keep the import and move nothing: both modules only use each other inside getters. Verify with the test run.)

Replace the three getters:

```ts
  /**
   * The attachments of the message, by ID, like discord.js's `Message#attachments`.
   */
  public get attachments(): Collection<string, Attachment> {
    return new Collection(
      (this[kData].attachments ?? []).map((attachment) => [attachment.id, new Attachment(attachment)]),
    );
  }
```

```ts
  /**
   * The stickers of the message, by ID, like discord.js's `Message#stickers`: partial stickers carrying the ID, name,
   * and format of the payload's sticker items. Fetch a full one with `client.fetchSticker(id)`.
   */
  public get stickers(): Collection<string, Sticker> {
    const client = this[kClient];
    return new Collection(
      (this[kData].sticker_items ?? []).map((item) => {
        const sticker = new Sticker(item as never);
        return [item.id, client ? bindClient(sticker, client) : sticker];
      }),
    );
  }
```

```ts
  public get messageSnapshots(): Collection<string, Message> {
    const snapshots = this[kData].message_snapshots;
    const collection = new Collection<string, Message>();
    if (!snapshots?.length) return collection;
    const reference = this[kData].message_reference;
    const client = this[kClient];
    for (const snapshot of snapshots) {
      const message = new Message({
        ...snapshot.message,
        id: reference?.message_id ?? this.id,
        channel_id: reference?.channel_id ?? this.channelId,
        guild_id: reference?.guild_id,
      } as CacheEntityTypes["messages"]);
      collection.set(message.id, client ? bindClient(message, client) : message);
    }

    return collection;
  }
```

Keep the existing JSDoc of `messageSnapshots`, changing "as messages" to "as a collection of messages, by the ID of the forwarded message". `equals` reads `this[kData].attachments`, not the getter: no change.

Read `packages/plugin-gateway/src/structures/stickers/Sticker.ts` in full: every getter must tolerate a sticker item, which only has `id`, `name`, `format_type`. Getters reading `this[kData].<field>` with a fallback are fine; fix any that would throw on `undefined` (e.g. `.split` on `tags`) to return `null`/empty, and cover the fix by adding to the first new test: `expect(() => JSON.stringify(msg.stickers.get("5"))).not.toThrow();`.

- [ ] **Step 4: Implement `ReactionManager`**

In `packages/plugin-gateway/src/managers/ReactionManager.ts`, import `Collection` from `@discordjs/collection` and replace `cache`:

```ts
  /**
   * The reactions of the message, by emoji like discord.js's `ReactionManager#cache`: the ID of a custom emoji, the
   * name of a Unicode one.
   */
  public get cache(): Collection<string, MessageReaction> {
    return new Collection(
      this.#reactions.map((reaction) => {
        const structure = bindClient(
          new MessageReaction(
            { ...reaction, channel_id: this.channelId, message_id: this.messageId },
            {
              message: this.#message,
              emoji: (reaction.emoji.id && this.#emojis?.get(reaction.emoji.id)) || null,
            },
          ),
          this.client,
        );
        return [structure.valueOf(), structure];
      }),
    );
  }
```

`resolve` and `MessageReaction#fetch` call `this.cache.find((reaction) => …)`; `Collection#find` takes the value first, so both keep working unchanged — confirm by the test run.

- [ ] **Step 5: Update the dispatch and the event type**

`packages/plugin-gateway/src/util/dispatch.ts`, `MessageReactionRemoveAll` (l.320): import `Collection` from `@discordjs/collection` (if not imported) and replace the two `?? []`:

```ts
    before: async (client, data) =>
      (await previousOf(client.messages, data.channel_id, data.message_id))?.reactions.cache ??
      new Collection<string, MessageReaction>(),
    build: async (client, data, previous: Collection<string, MessageReaction> | undefined) => [
      (await cachedOrUndefined(() =>
        cachedOf(client.messages, data.channel_id, data.message_id),
      )) ?? partialMessage(client, data.channel_id, data.message_id, data.guild_id),
      previous ?? new Collection<string, MessageReaction>(),
      data,
    ],
```

`packages/plugin-gateway/src/util/events.ts` l.212: change `reactions: MessageReaction[]` to `reactions: Collection<string, MessageReaction>` (import the `Collection` type), and say "by emoji" in its JSDoc. discord.js emits a `Collection` there too.

- [ ] **Step 6: Run the tests and typecheck**

Run: `pnpm vitest run packages/plugin-gateway` then `pnpm typecheck`
Expected: PASS. Typecheck finds any remaining array-style use of the four members in `src`; fix each by switching to the `Collection` API (`.size`, `.first()`, `.values()`).

- [ ] **Step 7: Commit**

```bash
git add packages/plugin-gateway
git commit -m "feat(plugin-gateway)!: Collection containers on Message and ReactionManager"
```

---

### Task 4: `Message#partial` follows discord.js

**Files:**

- Modify: `packages/plugin-gateway/src/structures/messages/Message.ts` (`partial`, l.472)
- Test: `packages/plugin-gateway/tests/partials.test.ts`

**Interfaces:**

- Produces: `Message#partial` is `true` when `content` is not a string or `author` is missing.

- [ ] **Step 1: Write the failing test**

Add to `packages/plugin-gateway/tests/partials.test.ts` (import `Message` from `"../src/index.js"` if needed), in the describe block holding the message tests:

```ts
test("GIVEN a message without content or without author THEN it is partial", () => {
  const author = { id: "1", username: "wolf", discriminator: "0", global_name: null, avatar: null };

  expect(new Message({ id: "3", channel_id: "20", author } as never).partial).toBe(true);
  expect(new Message({ id: "3", channel_id: "20", content: "hi" } as never).partial).toBe(true);
  expect(new Message({ id: "3", channel_id: "20", author, content: "" } as never).partial).toBe(
    false,
  );
});
```

- [ ] **Step 2: Run and see it fail**

Run: `pnpm vitest run packages/plugin-gateway/tests/partials.test.ts`
Expected: FAIL on the first assertion (author without content was not partial).

- [ ] **Step 3: Implement**

Replace the getter body and extend its JSDoc in `Message.ts`:

```ts
  /**
   * Whether the message is partial, like discord.js's `Message#partial`: it lacks its content or its author. That is
   * a message built from its IDs alone for an event about an uncached message (see `Partials.Message`), or from an
   * update that carried neither. Only `id`, `channelId`, and `guildId` are reliable then, and {@link Message.fetch}
   * completes it.
   */
  public get partial(): boolean {
    return typeof this[kData].content !== "string" || this[kData].author === undefined;
  }
```

- [ ] **Step 4: Run the gateway suite**

Run: `pnpm vitest run packages/plugin-gateway`
Expected: PASS. A test that built a message without `content` and expected `partial === false` (search `partial).toBe(false)` in `tests/`) gets `content` added to its fixture: its intent is a complete message.

Also search `src` for `.partial` on messages (`grep -rn "\.partial" packages/plugin-gateway/src`): any code branching on a message's `partial` to decide whether to fetch keeps the right meaning (a content-less message is worth fetching). `UserManager.ts:115` is about users and is unaffected.

- [ ] **Step 5: Commit**

```bash
git add packages/plugin-gateway
git commit -m "feat(plugin-gateway)!: Message#partial also checks the content"
```

---

### Task 5: `react()` returns the `MessageReaction`

**Files:**

- Create: `packages/plugin-gateway/src/util/reactions.ts`
- Modify: `packages/plugin-gateway/src/managers/MessageManager.ts` (`react`, l.365)
- Modify: `packages/plugin-gateway/src/structures/messages/Message.ts` (`react`, l.545)
- Modify: `packages/plugin-gateway/src/structures/messages/MessageReaction.ts` (`react`, l.136)
- Test: `packages/plugin-gateway/tests/util.test.ts`, `messages.test.ts`, `reactions.test.ts`

**Interfaces:**

- Consumes: `Collection`-keyed `ReactionManager` (Task 3); `addReaction` dedupe (Task 1, rebuilt `@wolfstar/plugin-cache`).
- Produces:
  - `withOwnReaction(reactions: readonly APIReaction[] | undefined, emoji: EmojiIdentifierResolvable): APIReaction[]` in `util/reactions.ts` (internal, not exported from the package index)
  - `Message#react(emoji): Promise<MessageReaction>`
  - `MessageReaction#react(): Promise<this>` with counts bumped
  - `MessageManager#react` still `Promise<void>`, now patching the cached message

- [ ] **Step 1: Write the failing helper tests**

Add to `packages/plugin-gateway/tests/util.test.ts`:

```ts
import { withOwnReaction } from "../src/util/reactions.js";

describe("withOwnReaction", () => {
  const counts = { count_details: { normal: 2, burst: 0 }, me_burst: false, burst_colors: [] };

  test("GIVEN a new unicode emoji THEN a reaction of the bot is appended", () => {
    expect(withOwnReaction(undefined, "🐺")).toEqual([
      {
        emoji: { id: null, name: "🐺" },
        count: 1,
        count_details: { normal: 1, burst: 0 },
        me: true,
        me_burst: false,
        burst_colors: [],
      },
    ]);
  });

  test("GIVEN a new custom emoji THEN its ID, name and animated flag are kept", () => {
    const [reaction] = withOwnReaction([], "<a:howl:123456789012345678>");

    expect(reaction!.emoji).toEqual({ id: "123456789012345678", name: "howl", animated: true });
  });

  test("GIVEN an emoji others reacted with THEN the counts go up and me is set", () => {
    const existing = { ...counts, count: 2, me: false, emoji: { id: null, name: "🐺" } };

    expect(withOwnReaction([existing], "🐺")).toEqual([
      { ...existing, count: 3, count_details: { normal: 3, burst: 0 }, me: true },
    ]);
  });

  test("GIVEN an emoji the bot already reacted with THEN the very same array is returned", () => {
    const reactions = [{ ...counts, count: 2, me: true, emoji: { id: null, name: "🐺" } }];

    expect(withOwnReaction(reactions, "🐺")).toBe(reactions);
  });

  test("GIVEN a custom emoji matched by ID under another name THEN it is the same reaction", () => {
    const existing = {
      ...counts,
      count: 2,
      me: false,
      emoji: { id: "123456789012345678", name: "old" },
    };

    expect(withOwnReaction([existing], "howl:123456789012345678")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run and see them fail**

Run: `pnpm vitest run packages/plugin-gateway/tests/util.test.ts -t withOwnReaction`
Expected: FAIL — cannot resolve `../src/util/reactions.js`.

- [ ] **Step 3: Implement the helper**

Create `packages/plugin-gateway/src/util/reactions.ts`:

```ts
import type { APIReaction } from "discord-api-types/v10";
import {
  ReactionEmoji,
  type EmojiIdentifierResolvable,
} from "../structures/emojis/ReactionEmoji.js";

/**
 * Adds the bot's own, normal reaction to the raw reactions of a message, as the API counts it once the reaction route
 * answers: what discord.js's `MessageReactionAdd` action does for `Message#react`.
 *
 * @param reactions The raw reactions of the message.
 * @param emoji The emoji the bot reacted with.
 * @returns The updated reactions, or the very same array when the bot had already reacted with the emoji.
 * @internal
 */
export function withOwnReaction(
  reactions: readonly APIReaction[] | undefined,
  emoji: EmojiIdentifierResolvable,
): APIReaction[] {
  const current = (reactions ?? []) as APIReaction[];
  const { id, name, animated } = ReactionEmoji.resolvePartial(emoji);
  const existing = current.find((reaction) =>
    id ? reaction.emoji.id === id : !reaction.emoji.id && reaction.emoji.name === name,
  );

  if (!existing) {
    return [
      ...current,
      {
        emoji: id ? { id, name, animated } : { id: null, name },
        count: 1,
        count_details: { normal: 1, burst: 0 },
        me: true,
        me_burst: false,
        burst_colors: [],
      },
    ];
  }

  if (existing.me) return current;
  return current.map((reaction) =>
    reaction === existing
      ? {
          ...reaction,
          count: reaction.count + 1,
          count_details: {
            ...reaction.count_details,
            normal: (reaction.count_details?.normal ?? 0) + 1,
            burst: reaction.count_details?.burst ?? 0,
          },
          me: true,
        }
      : reaction,
  );
}
```

`ReactionEmoji.resolvePartial("🐺")` must yield `{ id: null, name: "🐺", animated: false }`; if the first helper test shows the name URL-encoded or otherwise different, decode it in the helper (`decodeURIComponent`) rather than changing `resolvePartial`.

Run: `pnpm vitest run packages/plugin-gateway/tests/util.test.ts -t withOwnReaction`
Expected: PASS.

- [ ] **Step 4: Write the failing structure tests**

In `packages/plugin-gateway/tests/messages.test.ts`, extend the existing test `"GIVEN react with a custom emoji THEN it targets the own reaction route"` and add the others. `MessageReaction` must be added to the `../src/index.js` import.

```ts
test("GIVEN react with a custom emoji THEN it targets the own reaction route and returns the reaction", async () => {
  createClient();
  const put = vi.spyOn(container.rest, "put").mockResolvedValue(undefined);
  const msg = new Message(message());

  const reaction = await msg.react("<:howl:123456789012345678>");

  expect(put).toHaveBeenCalledWith(
    Routes.channelMessageOwnReaction(channelId, "1200000000000000000", "howl:123456789012345678"),
    { signal: undefined },
  );
  expect(reaction).toBeInstanceOf(MessageReaction);
  expect(reaction.count).toBe(1);
  expect(reaction.me).toBe(true);
  expect(reaction.emoji.id).toBe("123456789012345678");
  expect(reaction.message).toBe(msg);
  expect(msg.reactions.cache.size).toBe(1);
});

test("GIVEN react with an emoji the bot already used THEN the count is unchanged", async () => {
  createClient();
  vi.spyOn(container.rest, "put").mockResolvedValue(undefined);
  const msg = new Message(message());

  await msg.react("🐺");
  const reaction = await msg.react("🐺");

  expect(reaction.count).toBe(1);
  expect(msg.reactions.cache.size).toBe(1);
});

test("GIVEN react on a cached message THEN the cached reactions follow", async () => {
  const client = createClient();
  vi.spyOn(container.rest, "put").mockResolvedValue(undefined);
  const key = messageKey(channelId, "1200000000000000000");
  await client.cache!.messages.set(key, message());
  const msg = await client.messages.fetch(channelId, "1200000000000000000");

  await msg.react("🐺");

  expect((await client.cache!.messages.get(key))?.reactions).toMatchObject([
    { count: 1, me: true, emoji: { name: "🐺" } },
  ]);
});

test("GIVEN MessageReaction#react THEN it returns itself with the bot counted", async () => {
  createClient();
  vi.spyOn(container.rest, "put").mockResolvedValue(undefined);
  const msg = new Message(
    message({
      reactions: [
        {
          count: 2,
          count_details: { normal: 2, burst: 0 },
          me: false,
          me_burst: false,
          burst_colors: [],
          emoji: { id: null, name: "🐺" },
        },
      ],
    }),
  );
  const reaction = msg.reactions.resolve("🐺")!;

  expect(await reaction.react()).toBe(reaction);
  expect(reaction.count).toBe(3);
  expect(reaction.me).toBe(true);
  expect(msg.reactions.resolve("🐺")?.count).toBe(3);
});
```

Look at how the neighbouring "pin" test (l.~185-196) seeds and reads `client.cache!.messages`; mirror it exactly in the cached test if the seeding call differs.

In `packages/plugin-gateway/tests/reactions.test.ts`, add inside `describe("reaction events")` (import `container` from `@wolfstar/http-framework` and `vi` from `vitest`):

```ts
test("GIVEN the bot's own reaction echoed after react() THEN it is counted once", async () => {
  const client = createClient();
  await createMessage(client);
  vi.spyOn(container.rest, "put").mockResolvedValue(undefined);
  const message = await client.messages.fetch("20", "30");

  await message.react("🐺");
  await dispatch(client, GatewayDispatchEvents.MessageReactionAdd, reaction(botId));

  const cached = await client.messages.cache.get(client.messages.resolveKey("20", "30"));
  expect(cached?.reactions.resolve("🐺")?.count).toBe(1);
  expect(cached?.reactions.resolve("🐺")?.me).toBe(true);
  vi.restoreAllMocks();
});
```

- [ ] **Step 5: Run and see them fail**

Run: `pnpm vitest run packages/plugin-gateway/tests/messages.test.ts packages/plugin-gateway/tests/reactions.test.ts -t react`
Expected: FAIL — `react()` returns the message (`toBeInstanceOf(MessageReaction)`), counts unchanged.

- [ ] **Step 6: Implement**

`packages/plugin-gateway/src/managers/MessageManager.ts`, `react` (import `withOwnReaction` from `"../util/reactions.js"`); follow the `pin` method above it for the `_patchCached` idiom:

```ts
  /**
   * Reacts to a message as the bot, and counts the reaction on the cached message.
   */
  public async react(
    channelId: string,
    messageId: string,
    emoji: EmojiIdentifierResolvable,
  ): Promise<void> {
    await this.client.api.channels.addMessageReaction(
      channelId,
      messageId,
      ReactionEmoji.resolveIdentifier(emoji),
    );
    await this._patchCached(this.resolveKey(channelId, messageId), (cached) => {
      const { reactions } = cached.toJSON();
      const updated = withOwnReaction(reactions, emoji);
      return updated === reactions ? undefined : { reactions: updated };
    });
  }
```

Keep the method's existing JSDoc `@param` lines.

`packages/plugin-gateway/src/structures/messages/Message.ts`, `react` (import `withOwnReaction` and the `MessageReaction` type):

```ts
  /**
   * Reacts to the message as the bot.
   *
   * @param emoji The emoji.
   * @returns The reaction, counting the bot, like discord.js's `Message#react`.
   */
  public async react(emoji: EmojiIdentifierResolvable): Promise<MessageReaction> {
    await this.client.messages.react(this.channelId, this.id, emoji);
    // With a cache of instances the manager already patched this very message; the helper is then a no-op.
    const reactions = withOwnReaction(this[kData].reactions, emoji);
    if (reactions !== this[kData].reactions) this[kPatch]({ reactions });
    return this.reactions.resolve(emoji)!;
  }
```

`packages/plugin-gateway/src/structures/messages/MessageReaction.ts`, `react` (import `withOwnReaction`):

```ts
  /**
   * Reacts with this emoji as the bot, and counts the bot in this reaction.
   */
  public async react(): Promise<this> {
    const { message } = this;
    if (message) return this[kPatch]((await message.react(this[kData].emoji)).toJSON());

    await this.client.messages.react(this.channelId, this.messageId, this.reactionEmoji.identifier);
    // A partial reaction has no counts to bump: only `me` is known.
    if (this.partial) return this[kPatch]({ me: true });
    const [updated] = withOwnReaction([this.toJSON()], this[kData].emoji);
    return this[kPatch](updated!);
  }
```

Check the `message` getter name and the shape `toJSON()` returns on `MessageReaction` (it includes `channel_id`/`message_id`; patching them back is harmless). If `toJSON()` is not assignable to `APIReaction`, cast at the call (`this.toJSON() as APIReaction`).

- [ ] **Step 7: Run the tests**

Run: `pnpm vitest run packages/plugin-gateway`
Expected: PASS, including the echo test (needs the rebuilt `@wolfstar/plugin-cache` from Task 1; if it fails with `count` 2, run `pnpm turbo run build --filter=@wolfstar/plugin-cache` and retry). If the echo test still counts 2, the default-mode dispatch does not go through `addReaction`: find the reaction write with `grep -rn "MessageReactionAdd" packages/plugin-gateway/src/util/dispatchState.ts packages/plugin-cache/src/lib/operations.ts`, and apply the same `me`-already-set guard there.

- [ ] **Step 8: Commit**

```bash
git add packages/plugin-gateway
git commit -m "feat(plugin-gateway)!: react() returns the MessageReaction"
```

---

### Task 6: Types, docs, changeset, verification

**Files:**

- Create: `packages/plugin-gateway/tests/types/contracts.ts`
- Create: `.changeset/structure-contract-parity.md`
- Modify: `packages/plugin-gateway/README.md` (l.130, l.875-895)
- Modify: `docs/superpowers/specs/2026-10-02-structure-contract-parity-design.md` (status line)

**Interfaces:**

- Consumes: every public type produced by Tasks 2–5.

- [ ] **Step 1: Write the type-level test**

Create `packages/plugin-gateway/tests/types/contracts.ts` (checked by `pnpm typecheck` through `tsconfig.consumption.json`, like `resolvables.ts`):

```ts
// Type-level test, checked by the root `typecheck` script through `tsconfig.consumption.json`: the members sharing a
// name with discord.js have its return types.
import type { Collection } from "@discordjs/collection";
import type {
  Attachment,
  GatewayEventMap,
  Message,
  MessageReaction,
  Sticker,
  User,
} from "../../src/index.js";

declare const message: Message;
declare const reaction: MessageReaction;
declare const user: User;

export const attachments: Collection<string, Attachment> = message.attachments;
export const stickers: Collection<string, Sticker> = message.stickers;
export const snapshots: Collection<string, Message> = message.messageSnapshots;
export const reactions: Collection<string, MessageReaction> = message.reactions.cache;
export const reacted: Promise<MessageReaction> = message.react("🐺");
export const reactedAgain: Promise<MessageReaction> = reaction.react();
export const removedAll: Collection<string, MessageReaction> = (
  null as unknown as GatewayEventMap["messageReactionRemoveAll"]
)[1];
export const value: string | User = user.valueOf();

// @ts-expect-error `react()` no longer resolves to the message.
export const notTheMessage: Promise<Message> = message.react("🐺");
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS. A failure here is a real contract mismatch: fix the source type, not the test.

- [ ] **Step 3: Update the README**

In `packages/plugin-gateway/README.md`:

- l.130, events table: `` `message \| null`, `reactions` (a `Collection`), `data` ``.
- l.875 paragraph on `Message`: state that `attachments`, `stickers`, `messageSnapshots` and `reactions.cache` are `Collection`s keyed by ID (reactions by emoji ID or name), that `embeds` and `components` are arrays, that `react()` resolves to the `MessageReaction`, and that `partial` is `true` without content or author.
- l.889 example: change to

```ts
const reaction = await message.react("🐺");
console.log(reaction.count);
```

- Add one sentence where structures are introduced (search "valueOf" first; if absent, next to the `client` getter description): "Structures are valued by their ID (`valueOf()`), like discord.js's `Base`."

- [ ] **Step 4: Write the changeset**

Create `.changeset/structure-contract-parity.md`:

```md
---
"@wolfstar/plugin-gateway": minor
"@wolfstar/plugin-cache": patch
---

discord.js parity for the structure members that had its names but not its contracts.

**Breaking (`@wolfstar/plugin-gateway`):**

- `Message#react()` resolves to the `MessageReaction` instead of the message, and counts the bot on the message and on its cached entry. `MessageReaction#react()` bumps its counts too.
- `Message#attachments`, `Message#stickers`, `Message#messageSnapshots` and `ReactionManager#cache` are `Collection`s instead of arrays: use `.first()`, `.size`, `.get(id)`. Reactions are keyed by emoji ID, or name for Unicode emojis. The `messageReactionRemoveAll` event carries a `Collection` as well.
- `Message#stickers` holds partial `Sticker` structures instead of raw sticker items (`format_type` → `format`).
- `Message#partial` is `true` when the message lacks its content, not only its author.
- `valueOf()` of a structure is its ID when it has one, so structures compare and sort by ID.

`@wolfstar/plugin-cache`: a `MESSAGE_REACTION_ADD` for the bot's own reaction is no longer counted when the cached reaction already has `me` set.
```

- [ ] **Step 5: Mark the spec implemented**

In the spec, change `Status: **draft**, awaiting review.` to `Status: **implemented**.`

- [ ] **Step 6: Full verification**

Run each and read the output:

```bash
pnpm lint
pnpm build
pnpm typecheck
pnpm test
pnpm changeset status --since=origin/main
```

Expected: all pass; `changeset status` lists `@wolfstar/plugin-gateway` (minor) and `@wolfstar/plugin-cache` (patch). `oxfmt --check` may fail for every file in a CRLF checkout (`core.autocrlf=true`, a known environment quirk recorded in `2026-10-01-cache-core-followups.md`): in that case verify formatting through the pre-commit hook, which formats staged files.

- [ ] **Step 7: Commit**

```bash
git add .changeset/structure-contract-parity.md packages/plugin-gateway docs/superpowers
git commit -m "docs(plugin-gateway): document the structure contract parity"
```

Do not push or open a PR: that is the user's call (see `superpowers:finishing-a-development-branch`).
