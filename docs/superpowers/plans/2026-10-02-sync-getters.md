# Synchronous Getters and Lazy Relations (P2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** discord.js code reading `message.channel`, `member.permissions` or `member.kickable` works unchanged on `@wolfstar/plugin-gateway` with a synchronous cache.

**Architecture:** Relation getters fall back to a synchronous cache read through one `StructureMixin` helper. Derived getters are synchronous twins of the existing `fetch*` checks, built on `expectSync`/`requireCached`, which throw `CacheAsynchronous` on an asynchronous cache. Nothing existing changes signature.

**Tech Stack:** TypeScript 7, `@discordjs/collection`, vitest, changesets.

**Spec:** `docs/superpowers/specs/2026-10-02-sync-getters-design.md`

## Global Constraints

- Branch `feat/sync-getters`, stacked on `feat/structure-contract-parity`.
- Only `packages/plugin-gateway`, `.changeset/`, `docs/` change.
- Additive: every `fetch*` method and every existing signature stays.
- Relation getters never throw; derived getters never call the API.
- Asynchronous cache → `GatewayError` `CacheAsynchronous`; missing entity → `GuildUncached`, `GuildUncachedMe`, `ChannelUncached`, `GuildMemberUncached`.
- Uncached roles are skipped.
- Format only the files you touch (`pnpm exec oxfmt <files>`), never a whole directory: this checkout is CRLF.
- Conventional Commits, lower-case subject. Never `--no-verify`, never `git stash`.
- Test names: `GIVEN … THEN …`. Run tests from the repo root: `pnpm vitest run <path>`.
- Done: `pnpm build`, `pnpm typecheck`, `pnpm test` pass; `pnpm exec oxlint packages` clean; touched files formatted.

## Review Focus

1. A structure built by hand before any `GatewayClient` exists: relation getters answer `null`, no throw. — Task 2.
2. A relation the manager resolved as `null` (not cached at build time) that is cached later: the getter finds it. — Task 2.
3. A derived getter on an asynchronous store: throws `CacheAsynchronous`, leaves no unhandled rejection. — Tasks 1, 3.
4. `member.manageable` when the bot's member is not cached: `GuildUncachedMe`, not `false`. — Task 3.
5. `permissionsIn` a thread: the parent's overwrites apply; parent not cached → `ChannelUncached`. — Task 3.

---

### Task 1: Helpers and error codes

**Files:**

- Modify: `packages/plugin-gateway/src/util/cache.ts`
- Modify: `packages/plugin-gateway/src/errors/Messages.ts`
- Modify: `packages/plugin-gateway/src/structures/Structure.ts`
- Test: `packages/plugin-gateway/tests/util.test.ts`, `packages/plugin-gateway/tests/structures.test.ts`

**Interfaces — Produces:**

```ts
// util/cache.ts
export function readCached<Value extends StructureMixin<object>>(cache: Cache<Value>, key: string): Value | undefined;
export function syncOnly<T>(value: Awaitable<T>): T | undefined; // undefined for a promise (no-op catch attached)
export function expectSync<T>(value: Awaitable<T>, entity: string): T; // throws CacheAsynchronous(entity)
export function requireCached<Value extends StructureMixin<object>>(cache: Cache<Value>, key: string, entity: string): Value | undefined;

// Structure.ts, on StructureMixin
protected lazyRelation<Result>(name: string, read: (client: GatewayClient) => Result | null | undefined): Result | null;
```

Error messages added to `GatewayErrorMessages` (and `CacheAsynchronous` reworded):

```ts
CacheAsynchronous: (entity: string) =>
  `The ${entity} cache is asynchronous: use the asynchronous variant (the fetch* methods, or await cache.get)`,
GuildUncached: (guildId: string) => `Guild ${guildId} is not cached`,
GuildUncachedMe: (guildId: string) => `The client's member in guild ${guildId} is not cached`,
GuildMemberUncached: (guildId: string, userId: string) => `Member ${userId} of guild ${guildId} is not cached`,
ChannelUncached: (channelId: string) => `Channel ${channelId} is not cached`,
```

Check `Messages.ts` first: if a code with one of these names exists, reuse it instead of adding a duplicate.

- [ ] **Step 1: Failing tests** in `util.test.ts` (`describe("synchronous cache reads")`): build a `GatewayClient` with the default cache and one with an asynchronous store (wrap `createInMemoryCache()` stores so `synchronous` is `false` and `get` returns a promise — look at `tests/cache-modes.test.ts` for the existing helper doing this and reuse it). Assert:
  - `readCached` returns the instance on a hit, `undefined` on a miss, `undefined` on the asynchronous client;
  - `expectSync(1, "users")` is `1`; `expectSync(Promise.reject(new Error("x")), "users")` throws a `GatewayError` with code `CacheAsynchronous` and produces no unhandled rejection (await a macrotask after it);
  - `requireCached` returns the hit, `undefined` on a miss, throws `CacheAsynchronous` on the asynchronous client.

  In `structures.test.ts`: a test-only subclass exposing `lazyRelation` is not needed — Task 2's getters exercise it; here assert only that `new Message({ id: "3", channel_id: "20" } as never).guild` is `null` (it has no `guild_id`), which must stay true.

- [ ] **Step 2: Run, see the import failures.** `pnpm vitest run packages/plugin-gateway/tests/util.test.ts`

- [ ] **Step 3: Implement.**

```ts
// util/cache.ts
export function syncOnly<T>(value: Awaitable<T>): T | undefined {
  if (!isPromiseLike(value)) return value;
  // The read is abandoned: its failure must not surface as an unhandled rejection.
  value.then(undefined, () => {});
  return undefined;
}

export function expectSync<T>(value: Awaitable<T>, entity: string): T {
  if (!isPromiseLike(value)) return value;
  value.then(undefined, () => {});
  throw new GatewayError("CacheAsynchronous", entity);
}

export function readCached<Value extends StructureMixin<object>>(
  cache: Cache<Value>,
  key: string,
): Value | undefined {
  return cache.synchronous ? syncOnly(peekCache(cache, key)) : undefined;
}

export function requireCached<Value extends StructureMixin<object>>(
  cache: Cache<Value>,
  key: string,
  entity: string,
): Value | undefined {
  if (!cache.synchronous) throw new GatewayError("CacheAsynchronous", entity);
  return expectSync(peekCache(cache, key), entity);
}
```

Each gets a JSDoc with `@internal`, in the file's style. If importing `GatewayError` into `util/cache.ts` creates a cycle that breaks loading, put the four functions in a new `util/syncCache.ts` instead and import from there everywhere below.

```ts
// Structure.ts, in StructureMixin
  /**
   * Resolves a relation like discord.js's getters do: what the manager resolved when it built this structure, else a
   * synchronous read of the cache. `null` when neither has it, the cache is asynchronous, or no client exists.
   *
   * @param name The name of the relation.
   * @param read Reads the related structure from the client's cache, synchronously.
   */
  protected lazyRelation<Result>(
    name: string,
    read: (client: GatewayClient) => Result | null | undefined,
  ): Result | null {
    const resolved = (this[kRelations] as Record<string, unknown>)[name] as Result | null | undefined;
    if (resolved !== null && resolved !== undefined) return resolved;

    const client = this[kClient] ?? existingGatewayClient();
    return client ? (read(client) ?? null) : null;
  }
```

`existingGatewayClient()` is a new non-throwing sibling of `getGatewayClient()` in `util/container.ts`: returns the container's client when it is a `GatewayClient`, else `undefined`.

- [ ] **Step 4: Run** `pnpm vitest run packages/plugin-gateway` and `pnpm typecheck` — PASS (an existing test asserting the old `CacheAsynchronous` wording is updated to the new one).
- [ ] **Step 5: Commit** `feat(plugin-gateway): synchronous cache read helpers`.

---

### Task 2: Lazy relation getters

**Files:** every structure listed in the spec's "Lazy relations" section; `packages/plugin-gateway/src/structures/channels/mixins/ChannelPermissionMixin.ts` (`permissionsLocked` uses `this.parent`).
**Test:** new `packages/plugin-gateway/tests/lazy-relations.test.ts`.

**Interfaces — Consumes:** `lazyRelation`, `readCached`, `syncOnly` (Task 1).

Shared readers, added to `util/cache.ts` (or `util/syncCache.ts`) so each getter is one line:

```ts
export const cachedGuild = (client: GatewayClient, id: string | null | undefined) =>
  id ? syncOnly(client.guilds._getShallow(id)) : undefined;
export const cachedChannel = (client: GatewayClient, id: string | null | undefined) =>
  id ? readCached(client.channels.cache, id) : undefined;
export const cachedUser = (client: GatewayClient, id: string | null | undefined) =>
  id ? readCached(client.users.cache, id) : undefined;
export const cachedMember = (
  client: GatewayClient,
  guildId: string | null | undefined,
  userId: string | null | undefined,
) =>
  guildId && userId
    ? readCached(client.members.cache, client.members.resolveKey(guildId, userId))
    : undefined;
export const cachedMessage = (client: GatewayClient, channelId: string, messageId: string) =>
  readCached(client.messages.cache, client.messages.resolveKey(channelId, messageId));
```

`_getShallow` is only synchronous when the guild store is; `syncOnly` turns the asynchronous case into a miss. With the default cache `client.cache` may be an adapter over the structure cache: confirm `_getShallow` answers there (the guild test below fails otherwise — then read `client.guilds.cache` with `readCached` instead and ledger the ruling).

Getter pattern (repeat per file, using the structure's own ID getters or `this[kData]` fields):

```ts
  public get guild(): Guild | null {
    return this.lazyRelation("guild", (client) => cachedGuild(client, this.guildId));
  }
```

Voice state, presence, role: `readCached(client.voiceStates.cache, client.voiceStates.resolveKey(guildId, userId))`, likewise `client.presences`, `client.roles` (`resolveKey(guildId, roleId)`). A getter whose structure has no ID for the relation is left untouched; note each such skip in the ledger. Update the JSDoc of every changed getter: replace "`null` … when the X was not built by a manager" with "`null` when it is not cached, or the cache is asynchronous".

- [ ] **Step 1: Failing tests** in `lazy-relations.test.ts`. Setup: `createClient()` with the default cache (no `cache` option), seed through gateway dispatches as `tests/relations-messages.test.ts` does (`GuildCreate` with a channel, a role and a member; `MessageCreate`). Then build structures **by hand**, bound with `bindClient(structure, client)` (exported from `../src/index.js`; if it is not exported, build them through `client.<manager>._construct(data)`), and assert:
  - `Message`: `guild?.id`, `channel?.id`;
  - `GuildMember`: `guild?.id`; `voice`/`presence` after `VoiceStateUpdate`/`PresenceUpdate` dispatches;
  - `Role`, `GuildEmoji`, `Sticker`: `guild?.id`;
  - a text channel: `guild?.id`, `parent?.id` (seed a category), `permissionsLocked` is a boolean;
  - `MessageReaction`: `message?.id`; `VoiceState`: `member`, `guild`, `channel`.
  - Review Focus 2: build a message with `client.messages._build(data)` **before** its channel is cached (`channel` is `null`), dispatch `ChannelCreate`, then the same instance's `channel?.id` is the channel's.
  - Asynchronous store (helper from Task 1): the hand-built message's `guild` and `channel` are `null`, no throw.
  - Review Focus 1: run in a test that constructs no client — vitest isolates files, so put it in its own file `lazy-relations-no-client.test.ts`: `new Message({ id: "3", channel_id: "20", guild_id: "10" } as never).guild` is `null` and `.channel` is `null`.

- [ ] **Step 2: Run, see them fail** (getters answer `null`).
- [ ] **Step 3: Implement** the readers and every getter.
- [ ] **Step 4: Run** `pnpm vitest run packages` and `pnpm typecheck`. Existing tests asserting `null` for a relation that is in fact cached encode the old limitation: update the assertion and say so in the ledger.
- [ ] **Step 5: Commit** `feat(plugin-gateway): relation getters read the cache`.

---

### Task 3: Permissions and member getters

**Files:**

- Modify: `packages/plugin-gateway/src/util/permissions.ts`
- Modify: `packages/plugin-gateway/src/structures/guilds/GuildMember.ts`, `structures/guilds/Role.ts`, `structures/channels/mixins/ChannelPermissionMixin.ts`
- Test: new `packages/plugin-gateway/tests/sync-getters.test.ts`

**Interfaces — Produces:**

```ts
// util/permissions.ts
export function computeTargetPermissionsSync(guildId: Snowflake, overwrites: readonly APIOverwrite[], target: GuildMember | Role | Snowflake): PermissionsBitField;
export function computePermissionsInSync(channel: AnyChannel | Snowflake, target: GuildMember | Role | Snowflake): PermissionsBitField;

// GuildMember
get permissions(): Readonly<PermissionsBitField>;
permissionsIn(channel: AnyChannel | string): Readonly<PermissionsBitField>;
get manageable(): boolean; get kickable(): boolean; get bannable(): boolean; get moderatable(): boolean;
get displayColor(): number; get displayHexColor(): `#${string}`;
// Role
permissionsIn(channel: AnyChannel | string): Readonly<PermissionsBitField>;
// ChannelPermissionMixin
permissionsFor(target: GuildMember | Role | string): Readonly<PermissionsBitField>;
```

Rules (each mirrors its `fetch*` twin line by line; read the twin before writing):

- `GuildMember#permissions`: guild = `expectSync(client.guilds._getShallow(guildId), "guilds")`, missing → `GuildUncached`; roles = `expectSync(this.roles.cache, "roles")` (a `Collection`, `@everyone` included, uncached skipped); `computeGuildPermissions({ guildId, ownerId: guild.ownerId, userId: requireId(), memberRoleIds: roleIds, roles: roles.map((role) => role.toJSON()) })`.
- `manageable`: extract the rule from `fetchManageable` into a private `outranks(ownerId, meId, mine, theirs)` returning boolean, used by both. Sync inputs: guild as above; `me = expectSync(client.members.me(guildId), "members")`, `null` → `GuildUncachedMe` (only reached when the owner/self short-circuits do not apply, like the `fetch*` twin); `mine`/`theirs` = `expectSync(member.roles.highest, "roles")`.
- `kickable`/`bannable`: `manageable && me.permissions.has(...)`. `moderatable`: additionally `!this.permissions.has("Administrator")`. Share a private `managedWithSync(permission)` mirroring `managedWith`.
- `displayColor`: `expectSync(this.roles.color, "roles")?.color ?? 0`; `displayHexColor` formats it like `fetchDisplayHexColor`.
- `computeTargetPermissionsSync`: mirrors `computeTargetPermissions`; role branch reads `@everyone` with `requireCached(client.roles.cache, client.roles.resolveKey(guildId, guildId), "roles")` and treats a miss as no permissions (uncached roles are skipped); member-by-ID branch uses `requireCached(client.members.cache, …, "members")`, miss → `GuildMemberUncached`; then `computeChannelPermissions(member.permissions, …)`. Use the target's own client (`target.client`) when it is a structure, `getGatewayClient()` for an ID.
- `computePermissionsInSync`: mirrors `computePermissionsIn`; channel by ID through `requireCached(client.channels.cache, id, "channels")`, miss → `ChannelUncached(id)`; a thread resolves its parent the same way.
- `GuildMember#permissionsIn`, `Role#permissionsIn`: delegate to `computePermissionsInSync`. `permissionsFor`: delegates to `computeTargetPermissionsSync` with the channel's own `guild_id` and overwrites, `ChannelGuildUnknown` as in the twin.

- [ ] **Step 1: Failing tests** in `sync-getters.test.ts`. Fixture: default-cache client whose `clientId` is the bot; dispatch `GuildCreate` with owner `"1"`, roles `@everyone` (permissions `ViewChannel`), `mod` (position 2, `KickMembers | BanMembers | ModerateMembers`), `low` (position 1), a text channel with an overwrite denying `SendMessages` to `@everyone`, a thread under it; members: bot (`mod`), target (`low`), owner. Assert, each also compared to its awaited `fetch*` twin:
  - `target.permissions.has("ViewChannel")`, owner's `permissions` is all, `bot.permissions.has("KickMembers")`;
  - `target.permissionsIn(channelId).has("SendMessages")` is `false`; same through the thread (Review Focus 5); `channel.permissionsFor(target)` equal; `role.permissionsIn(channel)`;
  - `manageable`: target `true`; owner `false`; bot itself `false`; a member holding `mod` too → `false` (equal position); when the bot is the owner → `true` for anyone else;
  - `kickable`, `bannable`, `moderatable` `true` for target; `moderatable` `false` for a member with an `Administrator` role;
  - `displayColor` / `displayHexColor` with a coloured role;
  - asynchronous store: `member.permissions`, `member.manageable`, `member.permissionsIn(id)` throw `CacheAsynchronous` (Review Focus 3);
  - missing: guild not cached → `GuildUncached`; bot member not cached (`GuildMemberRemove` for the bot, or never seeded) → `member.manageable` throws `GuildUncachedMe` (Review Focus 4); `permissionsIn("unknown")` → `ChannelUncached`; `permissionsFor("unknown-user")` → `GuildMemberUncached`.
- [ ] **Step 2: Run, see them fail** (`permissions` undefined, etc.).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm vitest run packages` and `pnpm typecheck`.
- [ ] **Step 5: Commit** `feat(plugin-gateway): synchronous permission and member getters`.

---

### Task 4: Message, role, emoji and invite getters

**Files:** `structures/messages/Message.ts`, `structures/guilds/Role.ts`, `structures/emojis/GuildEmoji.ts`, `structures/invites/GuildInvite.ts`; tests appended to `sync-getters.test.ts`.

**Interfaces — Consumes:** `GuildMember#permissions`, `permissionsIn` (Task 3), `expectSync`.
**Produces:** `Message#editable`, `deletable`, `bulkDeletable`, `pinnable`, `crosspostable`; `Role#editable`; `GuildEmoji#deletable`; `GuildInvite#deletable` — all `boolean` getters.

Each mirrors its `fetch*` twin. The bot's member is read with a shared helper added to `util/permissions.ts`:

```ts
/** The bot's member of a guild from a synchronous cache; throws `CacheAsynchronous` or `GuildUncachedMe`. */
export function requireMe(client: GatewayClient, guildId: string): GuildMember {
  const me = expectSync(client.members.me(guildId), "members");
  if (!me) throw new GatewayError("GuildUncachedMe", guildId);
  return me;
}
```

(Task 3's `manageable` uses it too — define it in Task 3 if it is written first there.)

- `Message`: a private `hasPermissionSync(permission)` mirroring `hasPermission` (`false` without a guild, else `requireMe(...).permissionsIn(this.channelId).has(permission)`). `editable`: same expression as `fetchEditable`. `deletable`, `bulkDeletable`, `pinnable`: same boolean expressions with the sync helper. `crosspostable`: the channel through `this.channel` (lazy relation); `null` → `ChannelUncached(this.channelId)`.
- `Role#editable`, `GuildEmoji#deletable`, `GuildInvite#deletable`: twin logic with `requireMe`, `me.permissions`, and `expectSync(me.roles.highest, "roles")`.

- [ ] **Step 1: Failing tests**, same fixture: own message → `editable` and `deletable` `true`; someone else's message, bot with `ManageMessages` in the channel → `deletable` `true`, without → `false`; DM message → `deletable` `false` for others; `bulkDeletable` `false` for a 15-day-old ID; `pinnable` `false` for a system message; `crosspostable` in an announcement channel vs a text channel; `role.editable` (managed → `false`, lower role with `ManageRoles` → `true`, higher → `false`); emoji and invite `deletable`. Each compared with its awaited twin. One asynchronous-store test: `message.deletable` on someone else's guild message throws `CacheAsynchronous`.
- [ ] **Step 2: Run, see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm vitest run packages` and `pnpm typecheck`.
- [ ] **Step 5: Commit** `feat(plugin-gateway): synchronous message, role, emoji and invite checks`.

---

### Task 5: Types, docs, changeset, verification

**Files:** `packages/plugin-gateway/tests/types/sync-getters.ts` (new), `packages/plugin-gateway/README.md`, `.changeset/sync-getters.md` (new), the spec's status line, class JSDoc `@remarks` of `Message` and `GuildMember`.

- [ ] **Step 1: Type test** (checked by `pnpm typecheck`):

```ts
// Type-level test, checked by the root `typecheck` script through `tsconfig.consumption.json`: the derived getters of
// discord.js are synchronous here too.
import type { GuildMember, Message, Role, TextChannel } from "../../src/index.js";

declare const member: GuildMember;
declare const message: Message;
declare const role: Role;
declare const channel: TextChannel;

export const canBan: boolean = member.permissions.has("BanMembers");
export const inChannel: boolean = member.permissionsIn(channel).has("SendMessages");
export const checks: boolean[] = [
  member.manageable,
  member.kickable,
  member.bannable,
  member.moderatable,
];
export const color: number = member.displayColor;
export const messageChecks: boolean[] = [
  message.editable,
  message.deletable,
  message.pinnable,
  message.crosspostable,
  message.bulkDeletable,
];
export const roleEditable: boolean = role.editable;
export const forMember: boolean = channel.permissionsFor(member).has("ViewChannel");
export const guildName: string | undefined = message.guild?.name;
```

- [ ] **Step 2: README.** Rewrite the sentences presenting `fetchDeletable` & co. as the replacement of discord.js's getters (search `fetchDeletable`, `fetchPermissions`, `fetchManageable`, `fetchKickable` in `packages/plugin-gateway/README.md`): the getters exist with a synchronous cache and throw `CacheAsynchronous` otherwise, the `fetch*` methods work everywhere and fall back to the API. Add a short example. Document that relation getters read the cache. Update the `@remarks` of `Message` and `GuildMember` that say relations/derived checks are asynchronous only.
- [ ] **Step 3: Changeset** `.changeset/sync-getters.md`, `minor` for `@wolfstar/plugin-gateway`, listing the new members, the asynchronous-cache rule, the new error codes, and the relation getter change.
- [ ] **Step 4: Spec status** → `**implemented**.`
- [ ] **Step 5: Verify:** `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm exec oxlint packages`, `pnpm exec oxfmt --check $(git diff --name-only origin/main...HEAD -- packages)`, `pnpm exec changeset status --since=origin/main`. Read every output.
- [ ] **Step 6: Commit** `docs(plugin-gateway): document synchronous getters`. No push, no PR.
