# `Message` Type Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `@wolfstar/plugin-gateway`'s `Message` matches discord.js 14.27's `Message` typings: the `InGuild` generic, `PartialMessage`, `MessageSnapshot`, `OmitPartialGroupDMChannel`, `fetch(force)`, `forward(channel)`, and the members `sharedClientTheme`, `resolveComponent()`, `fetchWebhook()`.

**Architecture:** Type-level generic on `Message` (no runtime branch). `PartialMessage` becomes a `Partialize` of `Message`, so `partial` is the discriminant and `isPartial()` is dropped. Three small runtime additions (`fetch(force)`, `forward(channel)`, three members) reuse existing helpers.

**Tech Stack:** TypeScript 7 (golar typecheck), vitest, oxlint/oxfmt, changesets.

**Spec:** `docs/superpowers/specs/2026-10-05-message-types-parity-design.md`

## Global Constraints

- Paths are relative to `packages/plugin-gateway/` unless they start with `docs/` or `.changeset/`.
- Runtime is additive except `forward`, which widens its parameter. `Message#isPartial()` was never published, so it is removed without a shim.
- Lint on touched files only (repo-wide `pnpm lint` fails on CRLF, pre-existing): `sed -i 's/\r$//' <files>` then `pnpm exec oxfmt --check <files>` and `pnpm exec oxlint <files>`.
- Error texts for the webhook codes are exactly discord.js': `"The message was not sent by a webhook."` and `"This message webhook belongs to an application and cannot be fetched."`.
- Do not commit or push.
- Done = `pnpm build`, `pnpm typecheck`, `pnpm test` (repo root) green, plus `pnpm run docs` still builds.

## Spec amendment (decided while planning)

The spec lists `MessageMentions#members: If<InGuild, Collection<string, GuildMember>>`. That changes the runtime value from `GuildMember[]` to a `Collection`, contradicting "runtime is additive". `MessageMentions<InGuild>` therefore narrows **only `guild`**; `members` and `channels` keep their types. Task 5 edits the spec accordingly.

## Review Focus

- `Message<true>#guildId` is `string`, `Message<false>#guildId` is `null`, plain `Message` keeps `string | null` (Task 1 type test).
- A `PartialMessage` must not be assignable to `Message`, or `bulkDelete` results would hide missing `content`/`author` (Task 1 type test).
- `fetch(false)` on a cached message must not hit the REST API, and `fetch()` must (Task 2 runtime test).
- `forward` by channel structure and by ID must hit the same route; a `GroupDMChannel` must be a type error (Task 2).
- `fetchWebhook` on a message with no `webhook_id`, and on an application's interaction-reply (`webhook_id === application_id`), must throw the right code instead of calling the API (Task 3).
- `sharedClientTheme` is `null` with no payload field and omits `baseTheme` when `base_theme` is absent (Task 3).

---

### Task 1: Generic `Message`, `Partialize`, `PartialMessage`, drop `isPartial`

**Files:**

- Modify: `src/types.ts` (append helper types after `TextBasedChannel`, ~L97)
- Modify: `src/structures/messages/MessageMentions.ts` (generic `guild`)
- Modify: `src/structures/messages/Message.ts`
- Modify: `src/managers/MessageManager.ts:333-338`, `src/managers/ChannelMessageManager.ts`, `src/structures/channels/mixins/TextGuildChannelMixin.ts`, `src/util/dispatch.ts` (only if typecheck flags them)
- Modify: `tests/messages.test.ts:442` (drop the `isPartial()` assertion)
- Modify: `tests/types/bulk-delete.ts` (narrow on `partial`)
- Create: `tests/types/message-parity.ts`

**Interfaces:**

- Produces in `src/types.ts`:
  ```ts
  export type If<Value extends boolean, TrueResult, FalseResult = null> = Value extends true
    ? TrueResult
    : Value extends false
      ? FalseResult
      : TrueResult | FalseResult;
  export type GuildTextBasedChannel = Exclude<TextBasedChannel, DMChannel | GroupDMChannel>;
  export type AllowedPartial = Message;
  export type Partialize<
    Structure extends AllowedPartial,
    NulledKeys extends keyof Structure | null = null,
    NullableKeys extends keyof Structure | null = null,
    OverridableKeys extends keyof Structure | "" = "",
  > = {
    [K in keyof Omit<Structure, OverridableKeys>]: K extends "partial"
      ? true
      : K extends NulledKeys
        ? null
        : K extends NullableKeys
          ? Structure[K] | null
          : Structure[K];
  } & { [K in OverridableKeys]: K extends keyof Structure ? Structure[K] : never };
  ```
- Produces in `Message.ts`: `class Message<InGuild extends boolean = boolean>`, `interface PartialMessage<InGuild extends boolean = boolean>`, `inGuild(): this is Message<true>`.
- Produces in `MessageMentions.ts`: `class MessageMentions<InGuild extends boolean = boolean>` with `guild: If<InGuild, Guild | null, null>`.

- [ ] **Step 1: Write the failing type test** — `tests/types/message-parity.ts`:

```ts
// Type-level test, checked by the root `typecheck` script through `tsconfig.consumption.json`: `Message` follows
// discord.js' typings.
import type {
  Guild,
  Message,
  MessageMentions,
  PartialMessage,
  TextBasedChannel,
} from "../../src/index.js";

declare const message: Message;
declare const inGuild: Message<true>;
declare const outside: Message<false>;
declare const either: Message | PartialMessage;

export const guildId: string = inGuild.guildId;
export const noGuildId: null = outside.guildId;
export const maybeGuildId: string | null = message.guildId;
export const noGuild: null = outside.guild;
export const guild: Guild | null = inGuild.guild;
export const mentionsGuild: Guild | null = (inGuild.mentions as MessageMentions<true>).guild;
export const noMentionsGuild: null = (outside.mentions as MessageMentions<false>).guild;
export const channel: TextBasedChannel | null = outside.channel;

if (message.inGuild()) {
  const narrowed: Message<true> = message;
  void narrowed;
}

// `partial` is the discriminant between a message and a partial one.
if (either.partial) {
  const partial: PartialMessage = either;
  // @ts-expect-error a partial message may lack its content
  const content: string = either.content;
  void partial;
  void content;
} else {
  const full: Message = either;
  void full;
}

// @ts-expect-error a partial message is not a message
export const notAMessage: Message = null as unknown as PartialMessage;

export const isFalse: false = message.partial;
```

- [ ] **Step 2: Run to verify it fails** — from repo root: `pnpm typecheck`. Expected: errors in `message-parity.ts` (`Message` not generic).

- [ ] **Step 3: Add the helper types** to `src/types.ts` (the block above, after `TextBasedChannel`). Add `import type { Message } from "./structures/messages/Message.js";` if absent.

- [ ] **Step 4: Make `MessageMentions` generic** in `MessageMentions.ts`:
  - `export class MessageMentions<InGuild extends boolean = boolean> {`
  - `public get guild(): If<InGuild, Guild | null, null> { return (this.#relations.guild ?? null) as If<InGuild, Guild | null, null>; }`
  - `import type { If } from "../../types.js";`

- [ ] **Step 5: Make `Message` generic** in `Message.ts`:
  - `export interface Message<InGuild extends boolean = boolean> extends StructureMixin<CacheEntityTypes["messages"], MessageRelations> {}` and `export class Message<InGuild extends boolean = boolean> extends BaseMessage<"">`.
  - Replace the intersection `PartialMessage` with:
    ```ts
    /**
     * A message built from its IDs alone, like discord.js's `PartialMessage`: `partial` is `true`, and `content`,
     * `author` and `cleanContent` may be missing. Narrow a `Message | PartialMessage` with `partial`, then
     * {@link Message.fetch} completes it.
     */
    export interface PartialMessage<InGuild extends boolean = boolean> extends Partialize<
      Message<InGuild>,
      "pinned" | "system" | "tts" | "type",
      "author" | "cleanContent" | "content"
    > {}
    ```
  - `get guildId(): If<InGuild, string> { return (this[kData].guild_id ?? null) as If<InGuild, string>; }`
  - `get guild(): If<InGuild, Guild | null, null> { return this.lazyRelation(...) as If<InGuild, Guild | null, null>; }` (keep the existing body).
  - `get channel(): If<InGuild, GuildTextBasedChannel, TextBasedChannel> | null { return this.lazyRelation(...) as If<InGuild, GuildTextBasedChannel, TextBasedChannel> | null; }`
  - `get mentions(): MessageMentions<InGuild>` returning `new MessageMentions<InGuild>(...)`.
  - `inGuild(): this is Message<true> { return this.guildId !== null; }`
  - `get partial(): false { return (typeof this[kData].content !== "string" || this[kData].author === undefined) as false; }` — keep the doc comment, add: "Typed `false`, like discord.js: a partial message is a {@link PartialMessage}, whose `partial` is `true`."
  - Delete `isPartial()`.
  - Import `If`, `GuildTextBasedChannel`, `Partialize`, `TextBasedChannel` from `"../../types.js"` (type-only).

- [ ] **Step 6: Fix fallout** — run `pnpm typecheck`. Expected flags: `MessageManager._partial` cast (`as PartialMessage` may need `as unknown as PartialMessage`), places that read `.partial` on a `Message` and now see `false`, `this.channel` passed where `AnyChannel | null` is expected (should still be assignable). Fix each minimally; do not widen `partial` back.

- [ ] **Step 7: Update the existing bulk-delete tests.**
  - `tests/messages.test.ts:442`: delete the `expect(partial.isPartial()).toBe(true);` line (the `partial.partial` assertion on L441 stays: runtime value is still `true`, so type it with `(partial as Message).partial as boolean` only if typecheck of the test complains — vitest does not typecheck, so leave).
  - `tests/types/bulk-delete.ts` lines 31-36: replace with
    ```ts
    // A partial message narrows from the union with `partial`.
    declare const deleted: Message | PartialMessage | undefined;
    if (deleted?.partial) {
      const partial: PartialMessage = deleted;
      void partial;
    }
    ```

- [ ] **Step 8: Verify** — repo root: `pnpm typecheck` PASS, `pnpm exec vitest run packages/plugin-gateway/tests/messages.test.ts` PASS.

---

### Task 2: `MessageSnapshot`, `OmitPartialGroupDMChannel`, `fetch(force)`, `forward(channel)`

**Files:**

- Modify: `src/structures/messages/Message.ts`
- Modify: `tests/types/message-parity.ts`
- Modify: `tests/messages.test.ts`

**Interfaces:**

- Consumes: Task 1's `Message<InGuild>`, `Partialize`.
- Produces in `Message.ts`:

  ```ts
  export type OmitPartialGroupDMChannel<Structure extends { channel: AnyChannel | null }> =
    Structure & { channel: Exclude<Structure["channel"], GroupDMChannel> };
  export type MessageSnapshot = Partialize<
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
  >;
  ```

  and the signatures `delete/edit/pin/unpin/crosspost/suppressEmbeds/removeAttachments/fetch(force?) : Promise<OmitPartialGroupDMChannel<this>>`, `fetchReference/reply/forward : Promise<OmitPartialGroupDMChannel<Message<InGuild>>>`, `forward(channel: Exclude<TextBasedChannelResolvable, GroupDMChannel>)`, `messageSnapshots: Collection<string, MessageSnapshot>`.

- [ ] **Step 1: Failing type tests** — append to `tests/types/message-parity.ts`:

```ts
import type { GroupDMChannel, MessageSnapshot, TextChannel } from "../../src/index.js";

declare const groupDm: GroupDMChannel;
declare const text: TextChannel;

// `reply` and `edit` never resolve to a message of a group DM.
export async function omitted() {
  const reply = await message.reply("hi");
  const replyChannel: Exclude<typeof reply.channel, GroupDMChannel> = reply.channel;
  const edited = await message.edit("hi");
  const editedChannel: Exclude<typeof edited.channel, GroupDMChannel> = edited.channel;
  void replyChannel;
  void editedChannel;
  await message.fetch(false);
  await message.fetch();
}

// `forward` takes an ID or a channel, but not a group DM.
void message.forward("1");
void message.forward(text);
// @ts-expect-error a group DM channel can not be forwarded to
void message.forward(groupDm);

// A snapshot carries only the data a forwarded message keeps.
declare const snapshot: MessageSnapshot;
export const snapshotContent: string = snapshot.content;
export const snapshotPartial: true = snapshot.partial;
export const snapshotAuthor: unknown = snapshot.author;
```

Expected: FAIL (`MessageSnapshot` not exported, `fetch(false)` arity, `forward(text)`).

- [ ] **Step 2: Failing runtime tests** — append in `tests/messages.test.ts` inside the main `describe` (follow the `react` test style: `createClient()`, `vi.spyOn(container.rest, ...)`):

```ts
test("GIVEN fetch(false) on a cached message THEN it patches from the cache without a request", async () => {
  const client = createClient();
  const get = vi.spyOn(container.rest, "get").mockResolvedValue(message({ content: "fresh" }));
  const key = messageKey(channelId, "1200000000000000000");
  await client.cache!.messages.set(key, message({ content: "cached" }));
  const msg = new Message(message({ content: "stale" }));
  Object.assign(msg, {});
  const bound = await client.messages.fetch(channelId, "1200000000000000000");

  await bound.fetch(false);
  expect(get).not.toHaveBeenCalled();
  expect(bound.content).toBe("cached");

  await bound.fetch();
  expect(get).toHaveBeenCalledOnce();
  expect(bound.content).toBe("fresh");
});

test("GIVEN forward with a channel structure or an ID THEN both post the same forward", async () => {
  const client = createClient();
  const post = vi
    .spyOn(container.rest, "post")
    .mockResolvedValue(message({ id: "1300000000000000000" }));
  const key = messageKey(channelId, "1200000000000000000");
  await client.cache!.messages.set(key, message());
  const msg = await client.messages.fetch(channelId, "1200000000000000000");
  const target = createChannel({
    id: "300000000000000030",
    type: ChannelType.GuildText,
    guild_id: guildId,
  } as never);

  await msg.forward(target as TextChannel);
  await msg.forward("300000000000000030");

  expect(post).toHaveBeenCalledTimes(2);
  expect(post.mock.calls[0]).toEqual(post.mock.calls[1]);
  expect(post.mock.calls[0]![0]).toBe(Routes.channelMessages("300000000000000030"));
});
```

(Remove the two placeholder lines `const msg = new Message(...)` / `Object.assign(...)` from the first test before running; they are not needed.)

- [ ] **Step 3: Implement** in `Message.ts`:
  - Add the `OmitPartialGroupDMChannel` and `MessageSnapshot` types (above) and `import type { GroupDMChannel } from "../channels/GroupDMChannel.js"`, `TextBasedChannelResolvable` from types.
  - `messageSnapshots(): Collection<string, MessageSnapshot>`: same body, typed `new Collection<string, MessageSnapshot>()`; `collection.set(message.id, (client ? bindClient(message, client) : message) as unknown as MessageSnapshot)`.
  - `fetch`:
    ```ts
    public async fetch(force = true): Promise<OmitPartialGroupDMChannel<this>> {
      const message = await this.client.messages.fetch(this.channelId, this.id, { force });
      return this[kPatch](message.toJSON()) as OmitPartialGroupDMChannel<this>;
    }
    ```
  - `forward`:
    ```ts
    public forward(
      channel: Exclude<TextBasedChannelResolvable, GroupDMChannel>,
    ): Promise<OmitPartialGroupDMChannel<Message<InGuild>>> {
      const channelId = typeof channel === "string" ? channel : channel.id;
      return this.client.messages.forward(this.channelId, this.id, channelId) as Promise<
        OmitPartialGroupDMChannel<Message<InGuild>>
      >;
    }
    ```
  - `edit`, `crosspost`, `pin`, `unpin`, `delete`, `suppressEmbeds`, `removeAttachments` return `Promise<OmitPartialGroupDMChannel<this>>`; cast their `this` returns `as OmitPartialGroupDMChannel<this>`.
  - `reply`, `fetchReference` return `Promise<OmitPartialGroupDMChannel<Message<InGuild>>>` (cast the manager's `Promise<Message>`).

- [ ] **Step 4: Verify** — `pnpm typecheck` and `pnpm exec vitest run packages/plugin-gateway/tests/messages.test.ts` PASS. If a cast is rejected as "insufficient overlap", use `as unknown as`.

---

### Task 3: `sharedClientTheme`, `resolveComponent`, `fetchWebhook`

**Files:**

- Modify: `src/util/Transformers.ts` (add `SharedClientTheme` + `transformAPIMessageSharedClientTheme`)
- Modify: `src/errors/Messages.ts`
- Modify: `src/structures/messages/Message.ts`
- Modify: `src/index.ts` only if `Transformers` types are not re-exported by `export *` (check `grep -n "RoleSubscriptionData" src/index.ts`)
- Modify: `tests/messages.test.ts`, `tests/types/message-parity.ts`

**Interfaces:**

- Produces:

  ```ts
  export interface SharedClientTheme {
    colors: string[];
    gradientAngle: number;
    baseMix: number;
    baseTheme?: APIMessageSharedClientTheme["base_theme"];
  }
  export function transformAPIMessageSharedClientTheme(
    data: APIMessageSharedClientTheme,
  ): SharedClientTheme;
  ```

  `Message#sharedClientTheme: SharedClientTheme | null`, `Message#resolveComponent(customId: string): AnyComponent | APIAnyComponent | null`, `Message#fetchWebhook(): Promise<Webhook>`.
  Error codes `WebhookMessage`, `WebhookApplication` (both strings, no args).

- [ ] **Step 1: Failing runtime tests** — in `tests/messages.test.ts`:

```ts
test("GIVEN a shared client theme THEN sharedClientTheme camel-cases it, and is null without one", () => {
  const themed = new Message(
    message({
      shared_client_theme: { colors: ["5865F2"], gradient_angle: 90, base_mix: 50 },
    } as Partial<APIMessage>),
  );
  expect(themed.sharedClientTheme).toEqual({ colors: ["5865F2"], gradientAngle: 90, baseMix: 50 });
  expect(new Message(message()).sharedClientTheme).toBeNull();
});

test("GIVEN resolveComponent THEN it finds a component by custom ID, else null", () => {
  const msg = new Message(
    message({
      components: [
        {
          type: 1,
          components: [{ type: 2, style: 1, label: "go", custom_id: "go" }],
        },
      ],
    } as Partial<APIMessage>),
  );
  expect(msg.resolveComponent("go")).not.toBeNull();
  expect(msg.resolveComponent("nope")).toBeNull();
});

test("GIVEN fetchWebhook THEN a message without a webhook, or of an application, throws", async () => {
  const client = createClient();
  const spy = vi.spyOn(client, "fetchWebhook");
  const plain = await client.messages._add(message());
  await expect(plain.fetchWebhook()).rejects.toThrow("The message was not sent by a webhook.");

  const app = await client.messages._add(
    message({ webhook_id: "900000000000000900", application_id: "900000000000000900" }),
  );
  await expect(app.fetchWebhook()).rejects.toThrow(
    "This message webhook belongs to an application and cannot be fetched.",
  );
  expect(spy).not.toHaveBeenCalled();

  const hooked = await client.messages._add(message({ webhook_id: "800000000000000800" }));
  spy.mockResolvedValue({} as never);
  await hooked.fetchWebhook();
  expect(spy).toHaveBeenCalledWith("800000000000000800");
});
```

Run `pnpm exec vitest run packages/plugin-gateway/tests/messages.test.ts`: expected FAIL (members missing).

- [ ] **Step 2: Error codes** — in `src/errors/Messages.ts`, after `MessageReferenceMissing`:

  ```ts
  WebhookMessage: "The message was not sent by a webhook.",
  WebhookApplication: "This message webhook belongs to an application and cannot be fetched.",
  ```

- [ ] **Step 3: Transformer** — in `Transformers.ts`, next to `transformAPIRoleSubscriptionData`:

  ```ts
  /**
   * The custom client theme shared via a message, camel-cased like discord.js's `SharedClientTheme`.
   */
  export interface SharedClientTheme {
    colors: string[];
    gradientAngle: number;
    baseMix: number;
    baseTheme?: APIMessageSharedClientTheme["base_theme"];
  }

  /**
   * Transforms the shared client theme of a message.
   *
   * @param data The data to transform.
   */
  export function transformAPIMessageSharedClientTheme(
    data: APIMessageSharedClientTheme,
  ): SharedClientTheme {
    return {
      colors: data.colors,
      gradientAngle: data.gradient_angle,
      baseMix: data.base_mix,
      ...(data.base_theme === undefined ? {} : { baseTheme: data.base_theme }),
    };
  }
  ```

  Import `APIMessageSharedClientTheme` from `discord-api-types/v10`.

- [ ] **Step 4: Members** in `Message.ts`:

  ```ts
  /**
   * The custom client theme the message was shared with, camel-cased like discord.js's `Message#sharedClientTheme`.
   */
  public get sharedClientTheme(): SharedClientTheme | null {
    const theme = this[kData].shared_client_theme;
    return theme ? transformAPIMessageSharedClientTheme(theme) : null;
  }

  /**
   * Finds a component of the message by its custom ID, like discord.js's `Message#resolveComponent`.
   *
   * @param customId The custom ID.
   */
  public resolveComponent(customId: string): AnyComponent | APIAnyComponent | null {
    return findComponentByCustomId(this.components, customId);
  }

  /**
   * Fetches the webhook that sent the message, like discord.js's `Message#fetchWebhook`.
   *
   * @throws A `GatewayError`: `WebhookMessage` when a webhook did not send it, `WebhookApplication` when the webhook
   * belongs to an application.
   */
  public fetchWebhook(): Promise<Webhook> {
    const { webhookId } = this;
    if (!webhookId) return Promise.reject(new GatewayError("WebhookMessage"));
    if (webhookId === this.applicationId) {
      return Promise.reject(new GatewayError("WebhookApplication"));
    }

    return this.client.fetchWebhook(webhookId);
  }
  ```

  Imports: `findComponentByCustomId`, `type AnyComponent`, `type APIAnyComponent` from the module that exports them (`grep -n "export type AnyComponent\|APIAnyComponent" src/util/components.ts`), `type Webhook` from `../guilds/...` (grep where `Webhook` is defined), the two transformer names, `type SharedClientTheme`.

- [ ] **Step 5: Type test** — append to `tests/types/message-parity.ts`:

  ```ts
  import type { SharedClientTheme, Webhook } from "../../src/index.js";

  export const theme: SharedClientTheme | null = message.sharedClientTheme;
  export const webhook: Promise<Webhook> = message.fetchWebhook();
  ```

- [ ] **Step 6: Verify** — `pnpm typecheck`, `pnpm exec vitest run packages/plugin-gateway/tests/messages.test.ts` PASS.

---

### Task 4: Docs, changesets, spec amendment, full verification

**Files:**

- Modify: `README.md` (L986 `Message#isPartial()` sentence and the `Message` paragraph)
- Modify: `.changeset/bulk-delete-discordjs-parity.md`
- Create: `.changeset/message-types-discordjs-parity.md`
- Modify: `docs/superpowers/specs/2026-10-05-message-types-parity-design.md` (mentions amendment)

- [ ] **Step 1: README** — replace "`Message#isPartial()` narrows to `PartialMessage`." with "Narrow a `Message | PartialMessage` with `partial`." and extend the `Message` paragraph with one sentence naming the generic (`Message<true>`, narrowed by `inGuild()`), `PartialMessage`, `MessageSnapshot`, and `sharedClientTheme`/`resolveComponent()`/`fetchWebhook()`.

- [ ] **Step 2: Bulk-delete changeset** — drop the sentence "Add the `PartialMessage` type and `Message#isPartial()`." and replace it with "Add the `PartialMessage` type."

- [ ] **Step 3: New changeset** `.changeset/message-types-discordjs-parity.md`:

  ```md
  ---
  "@wolfstar/plugin-gateway": minor
  ---

  Make `Message` match discord.js's typings. `Message<InGuild>` is generic (`guildId`, `guild` and `mentions.guild` narrow, `inGuild()` is a type guard), `PartialMessage` is a `Partialize` of `Message` whose `partial` is `true` (and `Message#partial` is typed `false`), `messageSnapshots` returns `MessageSnapshot`s, and `edit`, `reply`, `fetch`, `forward`, `pin`, ... resolve to `OmitPartialGroupDMChannel`. Add `Message#fetch(force)`, `Message#sharedClientTheme`, `Message#resolveComponent()` and `Message#fetchWebhook()`; `Message#forward()` also takes a channel.

  Breaking, under 0.x: `PartialMessage` is no longer assignable to `Message`, and `Message#isPartial()` is gone (it was never published): narrow with `message.partial`.
  ```

- [ ] **Step 4: Spec** — change the `MessageMentions<InGuild>` paragraph to say it narrows only `guild`, and why (runtime of `members` stays an array).

- [ ] **Step 5: Lint touched files** — `git status --short`, then for the touched `.ts`/`.md`/`.json` files: `sed -i 's/\r$//' <files>`; `pnpm exec oxfmt --write <files>`; `pnpm exec oxlint <ts files>`. Expected: no errors.

- [ ] **Step 6: Full verification** — repo root: `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm run docs`. Expected: all green (105+ files).

---

## Self-review

- **Spec coverage:** generic (T1), `PartialMessage`/`partial`/`isPartial` removal (T1), snapshots, `OmitPartialGroupDMChannel`, `fetch(force)`, `forward` (T2), three members and error codes (T3), README/changesets/amendment (T4). `equals`, collectors, `resolved`, `groupActivityApplication` stay out, as in the spec.
- **Placeholders:** none; the two throwaway lines in T2 Step 2 are flagged for removal in the step itself.
- **Type consistency:** `OmitPartialGroupDMChannel`, `MessageSnapshot`, `SharedClientTheme`, `transformAPIMessageSharedClientTheme`, and error codes `WebhookMessage`/`WebhookApplication` are named identically across tasks.
