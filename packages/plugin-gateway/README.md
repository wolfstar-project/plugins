<div align="center">

<img src="https://cdn.wolfstar.rocks/wolfstar-assets/wolfstar.png" alt="WolfStar" width="100" />

# @wolfstar/plugin-gateway

**Gateway events, Discord structures, and API managers for `@wolfstar/http-framework`.**

[![version](https://npmx.dev/api/registry/badge/version/@wolfstar/plugin-gateway)](https://npmx.dev/package/@wolfstar/plugin-gateway)
[![downloads](https://npmx.dev/api/registry/badge/downloads/@wolfstar/plugin-gateway)](https://npmx.dev/package/@wolfstar/plugin-gateway)
[![license](https://img.shields.io/github/license/wolfstar-project/plugins?style=flat-square&color=informational)](https://github.com/wolfstar-project/plugins/blob/main/LICENSE)

</div>

## Description

`@wolfstar/plugin-gateway` extends the
[`@wolfstar/http-framework`](https://www.npmjs.com/package/@wolfstar/http-framework) client with
Discord gateway events and API access. `GatewayClient.start()` loads the framework's pieces, starts
its HTTP interaction endpoint, and connects the gateway shards in one call. Commands and HTTP
interactions continue to use the framework's existing client.

The gateway connection uses [`@discordjs/ws`](https://www.npmjs.com/package/@discordjs/ws) for
sharding, reconnects, and session resumes. Actions turn dispatches into events containing structures
such as `Message`, `User`, and `Guild`; `EventGatewayListener` lets pieces in the `listeners`
directory handle those events. Managers such as `client.users` and `client.guilds` read through
`manager.cache`, in memory by default, optionally backed by an [`@wolfstar/plugin-cache`](../plugin-cache)
store, and fetch missing data through `@discordjs/core`. The same core API is available as `client.api`.

> [!NOTE]
> A gateway connection is long-lived: a `GatewayClient` needs a persistent process, unlike a bot
> only serving HTTP interactions.

## Installation

```bash
pnpm add @wolfstar/plugin-gateway @wolfstar/plugin-cache
```

## Usage

```ts
import { GatewayClient } from "@wolfstar/plugin-gateway";
import { GatewayIntentBits } from "discord-api-types/v10";

const client = new GatewayClient({
  intents:
    GatewayIntentBits.Guilds | GatewayIntentBits.GuildMessages | GatewayIntentBits.MessageContent,
});

client.on("messageCreate", (message) => {
  const guild = message.guildId ? client.guilds.cache.get(message.guildId) : undefined;
  console.log(`${message.author.username} in ${guild?.name ?? "a DM"}: ${message.content}`);
});

await client.start({ listen: { port: 8080 } }); // loads pieces, starts HTTP, connects the gateway
```

### Options

On top of the `Client` options:

| Option                | Default           | Description                                                                                                                        |
| --------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `intents`             | —                 | The gateway intents.                                                                                                               |
| `cacheConstructor`    | `CollectionCache` | Builds `manager.cache`, the cache of structure instances each manager reads through, see [Cache](#cache).                          |
| `cacheOptions`        | `undefined`       | Per-entity options of those caches, e.g. `{ messages: { maxSize: 1_000 } }`, see [Bounding memory](#bounding-memory).              |
| `cache`               | `undefined`       | A `@wolfstar/plugin-cache` cache whose raw stores back the managers instead, see [Cache](#cache).                                  |
| `shardCount`          | `null`            | Total shards across every process, `null` for Discord's recommendation.                                                            |
| `shardIds`            | `null`            | The shards this client runs, as an array or a `{ start, end }` range. `null` for all.                                              |
| `gateway`             | `{}`              | Extra `@discordjs/ws` `WebSocketManager` options (`compression`, `initialPresence`, ...).                                          |
| `cacheFailure`        | `"skip"`          | On a cache read/write failure, `"skip"` drops the event, `"emitUncached"` emits it from the payload.                               |
| `dispatchTimeout`     | `30_000`          | Milliseconds after which a dispatch still processing is reported as a `DispatchTimeoutError`. `null` disables it.                  |
| `sessionStore`        | `undefined`       | A `GatewaySessionStore` keeping the shards' sessions across restarts, see [Resuming sessions](#resuming-sessions-across-restarts). |
| `sessionStoreTimeout` | `5_000`           | Milliseconds a shard waits for `sessionStore` to read its session before identifying. `null` waits forever.                        |
| `partials`            | `[]`              | The structures to build partially for uncached entities, see [Partials](#partials).                                                |
| `waitGuildTimeout`    | `15_000`          | Milliseconds `clientReady` waits for initially unavailable guilds before emitting anyway, see [Events](#events).                   |

`client.gateway` exposes the underlying `WebSocketManager`, e.g. to send presence updates.

### Partials

Like discord.js's `partials`, `Partials` lists the structures the client builds from the IDs a dispatch carries when
an event concerns an entity it has not cached: `User`, `Channel` (direct messages only), `GuildMember`, `Message`,
`Reaction`, `GuildScheduledEvent`, `ThreadMember`, `Poll`, `PollAnswer`, and `SoundboardSound`.

Unlike discord.js, events are emitted either way: without the partial, the uncached entity is `null` as usual. With
it, it is a structure whose `partial` is `true`. Only its IDs are reliable, and `fetch()` completes it. Partial
structures are never written to the cache. The reactions and poll answers of uncached messages are always partial, so
`Partials.Reaction` and `Partials.PollAnswer` change nothing and exist for parity.

```ts
const client = new GatewayClient({ intents, partials: [Partials.Message, Partials.User] });

client.on("messageDelete", async (message) => {
  if (message?.partial)
    console.log(`Uncached message ${message.id} deleted in ${message.channelId}`);
});
```

## Events

`GatewayEvents` mirrors the keys of the table below, like `@wolfstar/http-framework`'s own `Events`: each member's
value is the plain event name, so it is interchangeable with the string literal.

```ts
client.on(GatewayEvents.MessageCreate, (message) => console.log(message.content));
```

| Event                                                     | Arguments                                               |
| --------------------------------------------------------- | ------------------------------------------------------- |
| `raw`                                                     | `payload`, `shardId` — every dispatch                   |
| `shardReady`                                              | `shardId`, `user`                                       |
| `clientReady`                                             | `client` — once, see below                              |
| `shardResume` / `shardClose` / `shardError`               | `shardId` / `shardId, code` / `error, shardId`          |
| `guildCreate`                                             | `guild`                                                 |
| `guildUpdate`                                             | `oldGuild \| null`, `newGuild`                          |
| `guildDelete`                                             | `guild \| null`, `data`                                 |
| `channelCreate` / `channelDelete`                         | `channel`                                               |
| `channelUpdate`                                           | `oldChannel \| null`, `newChannel`                      |
| `threadCreate` / `threadUpdate` / `threadDelete`          | same shapes as channels                                 |
| `threadListSync`                                          | `threads`, `members`, `data`                            |
| `threadMemberUpdate`                                      | `oldMember \| null`, `newMember`                        |
| `threadMembersUpdate`                                     | `added`, `removed`, `thread \| null`, `data`            |
| `messageCreate`                                           | `message`                                               |
| `messageUpdate`                                           | `oldMessage \| null`, `newMessage`                      |
| `messageDelete`                                           | `message \| null`, `data`                               |
| `messageDeleteBulk`                                       | `messages`, `data`                                      |
| `messageReactionAdd` / `messageReactionRemove`            | `reaction`, `user \| null`, `details`                   |
| `messageReactionRemoveAll`                                | `message \| null`, `reactions` (a `Collection`), `data` |
| `messageReactionRemoveEmoji`                              | `reaction`                                              |
| `messagePollVoteAdd` / `messagePollVoteRemove`            | `answer`, `userId`                                      |
| `guildMemberAdd`                                          | `member`                                                |
| `guildMemberUpdate`                                       | `oldMember \| null`, `newMember`                        |
| `guildMemberRemove`                                       | `member \| null`, `data`                                |
| `guildRoleCreate` / `guildRoleUpdate` / `guildRoleDelete` | same shapes as members                                  |
| `guildMembersChunk`                                       | `members`, `guild \| null`, `data`                      |
| `userUpdate`                                              | `oldUser \| null`, `newUser`                            |
| `emojiCreate` / `emojiDelete`                             | `emoji`                                                 |
| `emojiUpdate`                                             | `oldEmoji`, `newEmoji`                                  |
| `stickerCreate` / `stickerDelete`                         | `sticker`                                               |
| `stickerUpdate`                                           | `oldSticker`, `newSticker`                              |
| `inviteCreate`                                            | `invite`                                                |
| `inviteDelete`                                            | `invite \| null`, `data`                                |
| `voiceStateUpdate`                                        | `oldState \| null`, `newState`                          |
| `presenceUpdate`                                          | `oldPresence \| null`, `newPresence`                    |
| `guildScheduledEventCreate` / `guildScheduledEventDelete` | `event`                                                 |
| `guildScheduledEventUpdate`                               | `oldEvent \| null`, `newEvent`                          |
| `guildScheduledEventUserAdd` / `...UserRemove`            | `event \| null`, `user \| null`, `data`                 |
| `stageInstanceCreate` / `stageInstanceDelete`             | `stageInstance`                                         |
| `stageInstanceUpdate`                                     | `oldStageInstance \| null`, `newStageInstance`          |
| `guildSoundboardSoundCreate`                              | `sound`                                                 |
| `guildSoundboardSoundUpdate`                              | `oldSound \| null`, `newSound`                          |
| `guildSoundboardSoundDelete`                              | `sound \| null`, `data`                                 |
| `guildSoundboardSoundsUpdate` / `soundboardSounds`        | `sounds`, `guildId`                                     |
| `guildBanAdd` / `guildBanRemove`                          | `ban`                                                   |
| `guildAuditLogEntryCreate`                                | `entry`                                                 |
| `autoModerationRuleCreate` / `autoModerationRuleDelete`   | `rule`                                                  |
| `autoModerationRuleUpdate`                                | `oldRule \| null`, `newRule`                            |
| `autoModerationActionExecution`                           | `execution`                                             |
| `guildIntegrationsUpdate`                                 | `guild \| null`, `data`                                 |
| `integrationCreate`                                       | `integration`                                           |
| `integrationUpdate`                                       | `oldIntegration \| null`, `newIntegration`              |
| `integrationDelete`                                       | `integration \| null`, `data`                           |

The previous state of update events and the entity of delete events come from the cache, and are
`null` when it was not cached (or when the client has no cache). `data` is the raw dispatch data,
which always identifies the deleted entity.

`clientReady` is emitted once, like discord.js's `Client#clientReady`: after every shard this client manages has
connected, and every guild `READY` listed as initially unavailable became available (or `waitGuildTimeout`, `15_000`
by default, elapsed — that timeout only bounds the wait on guilds, never on shards connecting).
`client.isClientReady()` and `client.clientReadyAt` report it after the fact.

```ts
client.on(GatewayEvents.ClientReady, (client) =>
  console.log(`Logged in as ${client.user!.username}`),
);
```

`client.actions` holds an `Action` for each handled gateway dispatch. Each action captures the
previous state, then builds and emits events after the cache has been updated. The built-in actions
use the `DispatchHandlers` and `MultiDispatchHandlers` tables. Dispatches they do not cover are
still written to the cache and emitted as `raw`. `INTERACTION_CREATE` is handled by the HTTP endpoint.

REST operations use `client.api` from `@discordjs/core`. A few endpoints without a matching
core method (cursor-based message pins, guild creation from a template, and thread member queries
with extra parameters) use the same core client's underlying REST transport.

Dispatches of the same guild (or direct message channel) are processed in order, so an
asynchronous cache never reorders them, while different guilds proceed concurrently: a slow guild
does not hold the others back. Dispatches that belong to no guild, such as `READY` or `USER_UPDATE`,
wait for everything queued before them on their shard, and everything after them waits for them.
`client.queueStats` reports the pending dispatches, and one still running after `dispatchTimeout`
is reported as a `DispatchTimeoutError` through the `error` event, without being cancelled.

A cache failure (Redis down, corrupt value) is always reported through `error`. With the default
`cacheFailure: "skip"` the event is dropped, so listeners never see state the cache does not hold;
with `"emitUncached"` it is emitted anyway, built from the payload, with `null` as previous state. `READY` is the
exception: it is always emitted, since it sets `client.user` from the payload alone.

On `READY`, the cached guilds of that shard which `READY` no longer lists are dropped and emitted as
`guildDelete`: the bot left them while disconnected, or while the process was down with a
persistent cache, and Discord does not replay those removals. This is best effort: a failure (cache unreachable,
unknown shard count) is reported through `error` and keeps the remaining guilds.

### Replaying dispatches on another process

A client that never connects to Discord can still emit the events of another process's client, as long as both
share a cache: the connected client handles each dispatch and writes it to the cache, and the other one replays it
without touching the cache again.

- The connected client emits `dispatch` after the cache write, with `payload`, `shardId` and a trailing `state`: what
  the dispatch's handler read before the write (the cached message a `MESSAGE_UPDATE` replaces, the member a
  `GUILD_MEMBER_REMOVE` drops, …), `undefined` when the type keeps none or it was not cached.
- `client.serializeDispatchState(type, state)` turns that `state` into plain, JSON-safe API data, and
  `client.reviveDispatchState(type, serialized, data)` rebuilds its structures on the receiving client. Relations
  (author, guild, …) resolve from the receiving client's cache as it is when the dispatch is replayed, so they can be
  newer than the dispatch. `DispatchStateCodecs` is the table behind both, one codec per type that keeps a state.
- `client.replayDispatch({ t, d, s? }, shardId, state?)` emits `raw` and the matching event, with the same Structures
  and `old` arguments the connected client emitted. It never reads or writes the cache, and never emits `dispatch`.
  Dispatches of a guild replay in order, like on a connected client. `client.replayDispatchTypes` lists the types it
  handles: `READY` and `INTERACTION_CREATE` are not replayed, so `client.user` stays `null` until something sets it,
  and shard lifecycle events never fire. The promise rejects when a listener or the handler throws, which lets the
  caller retry the dispatch; async listeners are awaited.

```ts
// Connected client: ship each dispatch with its previous state.
connected.on("dispatch", async (payload, shardId, state) => {
  const serialized = connected.serializeDispatchState(payload.t, state);
  await transport.send({ payload, shardId, state: serialized });
});

// Worker: same cache, never connected.
transport.receive(async ({ payload, shardId, state }) => {
  const revived = await worker.reviveDispatchState(payload.t, state, payload.d);
  await worker.replayDispatch(payload, shardId, revived);
});
```

[`@wolfstar/plugin-broker`](https://www.npmjs.com/package/@wolfstar/plugin-broker) wires this up over Redis Streams with
`forwardGatewayDispatches` and `replayGatewayDispatches`.

## Listeners

Since `GatewayClient` emits on the client itself, gateway events are handled by regular listener
pieces. `EventGatewayListener` pins the emitter to the client and types `run` after the event:

```ts
// listeners/log-messages.ts
import { EventGatewayListener, type Message } from "@wolfstar/plugin-gateway";

export class LogMessagesListener extends EventGatewayListener<"messageCreate"> {
  public constructor(context: EventGatewayListener.LoaderContext) {
    super(context, { event: "messageCreate" });
  }

  public override run(message: Message) {
    console.log(`${message.author.username}: ${message.content}`);
  }
}
```

Or, without a constructor, with `RegisterAsGatewayListener` (implemented like
`@wolfstar/plugin-subcommands-advanced`'s `RegisterAsSubcommand`):

```ts
import {
  EventGatewayListener,
  RegisterAsGatewayListener,
  type Message,
} from "@wolfstar/plugin-gateway";

@RegisterAsGatewayListener("messageCreate", { once: false })
export class LogMessagesListener extends EventGatewayListener<"messageCreate"> {
  public override run(message: Message) {
    console.log(`${message.author.username}: ${message.content}`);
  }
}
```

With `once: true`, the listener unloads itself after its first run.

Any piece (listener, command, interaction handler) reaches the client through
`this.container.gatewayClient`, typed as `GatewayClient`, so its managers need no cast:

```ts
import { Command } from "@wolfstar/http-framework";

export class GuildNameCommand extends Command {
  public override async chatInputRun(interaction: Command.ChatInputInteraction) {
    const guild = await this.container.gatewayClient.guilds.fetch(interaction.guildId!);
    return interaction.reply({ content: guild.name });
  }
}
```

`GatewayClient` registers itself as `container.gatewayClient` on construction, next to the
framework's `container.client`. The latter stays typed as the base `Client`: a module augmentation
cannot redeclare it with another type (TypeScript reports TS2717, or silently keeps `Client` under
`skipLibCheck`).

## Cache

Every manager exposes its cache as `manager.cache`, the `Cache` of the discord.js RFC:

```typescript
const user = client.users.cache.get(userId);
const member = client.members.cache.get(client.members.resolveKey(guildId, userId));

client.users.cache.has(userId);
client.users.cache.getSize();
```

By default, entities are kept in memory by `CollectionCache`, a `Collection` of structure instances: updates patch
the cached instance in place, as in discord.js, and every method is synchronous. Its relations (e.g. `member.voice`)
are re-resolved on every `cache.get`; instances reached by iterating the collection itself (`find`, `filter`, `map`,
...) carry the relations of their last `get`.

```typescript
import { createRedisCache } from "@wolfstar/plugin-cache";

new GatewayClient({ intents }); // CollectionCache, in memory
new GatewayClient({ intents, cache: createRedisCache(redis) }); // raw data in Redis
new GatewayClient({ intents, cache: null }); // nothing is cached
new GatewayClient({ intents, cacheConstructor: MyCache }); // your own Cache, see "Custom caches"
```

> [!IMPORTANT]
> The default keeps **every entity the gateway sends in memory until a dispatch removes it** (`MESSAGE_DELETE`,
> `GUILD_DELETE`, ...): nothing expires, so messages, users, and presences grow for as long as the process runs.
> See [Bounding memory](#bounding-memory).

With a `@wolfstar/plugin-cache` store, the cache holds raw API data and builds a structure on every read: the
methods return promises when the store is remote (`await` works with every cache, `manager.cache.synchronous` tells
them apart, see [Synchronous reads](#synchronous-reads)), and two reads return two objects. `policies` apply to
every write, in every mode (dispatches and manager writes alike); their `ttl` only applies to plugin-cache stores,
see [Store-backed caches](#store-backed-caches).

`manager.fetch(...)` reads the cache first and falls back to the REST API. `manager.cache` is keyed by a single ID
for most managers, and by `manager.resolveKey(...)` for the ones taking more than one argument:

| Manager           | `resolveKey` / `fetch` / `refresh` arguments |
| ----------------- | -------------------------------------------- |
| `client.users`    | `userId`                                     |
| `client.guilds`   | `guildId`                                    |
| `client.channels` | `channelId` (threads included)               |
| `client.threads`  | `threadId`                                   |
| `client.messages` | `channelId`, `messageId`                     |
| `client.members`  | `guildId`, `userId`                          |
| `client.roles`    | `guildId`, `roleId`                          |

- `cache.get` only reads the cache, resolving to `undefined` on a miss;
- `fetch` reads the cache, falling back to the REST API (and caching the result). Pass
  `{ force: true }` after the IDs to always hit the API, `{ cache: false }` not to store the result:
  `client.messages.fetch(channelId, messageId, { force: true })`;
- `refresh` is `fetch` with `{ force: true }`;
- `resolve` takes a structure (returned as is) or a cache key, like discord.js's `resolve`.

Every API payload is written to the cache: a cached entry is patched with it (the fields a partial payload lacks
keep their cached value) and the patched instance, or the newly built structure, is returned. Relations are
resolved from the cache too: `message.author` is the entry of `client.users`, `message.member` the one of
`client.members`, and the same goes for `member.user`, `emoji.author`, `sticker.user`, and `invite.inviter`. Every
structure of a guild (channels, threads, members, roles, messages, emojis, stickers, invites) has `guild`, built
from the cached guild, and messages have `channel`. These are `null` when the entity is not cached; `fetchGuild()`
and `fetchChannel()` always get it. A structure built by hand, with `new Message(data)`, falls back to the copy
embedded in its payload.

Which object a relation is depends on the relation. With the default cache, `message.author` and `message.channel`
are the cached instances, the very objects `client.users.cache.get(id)` and `client.channels.cache.get(id)` return.
`guild` is not: it is a shallow copy of the cached guild, holding the same data at the time the structure was read,
but `message.guild !== client.guilds.cache.get(message.guildId)`. Compare guilds by `id`, and read
`client.guilds.cache.get(id)` when you need the instance that later updates patch.

The same goes for what the client hands out outside of `manager.cache`: the structures delivered by events (the
message of `messageCreate`, the `new` of update events such as `guildMemberUpdate`, ...) and the ones `listCached`
returns are freshly built from the cache, they are not the cached instances and later dispatches do not patch them.
The previous state of update and delete events is a copy of the cached instance taken before the write; with the
default cache it carries the relations of the entity's last read rather than re-resolving them.
Only `manager.cache.get` (and `fetch`, `resolve`, which read it) returns the cached instance.

### Bounding memory

With the default cache, nothing is evicted unless a dispatch removes it. There are three ways to bound it:

- **`cacheOptions`** sets a `maxSize` per entity: once reached, the oldest entry is evicted for each new one, and
  `0` holds nothing. It is passed to the `cacheConstructor`, the default `CollectionCache` included.
  The bound is per entity, not per channel: unlike discord.js, a busy channel can evict the messages of a quiet
  one.

  `client.channels.cache` spans the channel and the thread caches, so it is a `Cache` but not a `Collection`: it
  has no `size`, `filter`, `find` or iteration, and `maxSize` applies to channels and threads separately.

  ```ts
  // The 1000 most recent messages, and no presence.
  new GatewayClient({
    intents,
    cacheOptions: { messages: { maxSize: 1_000 }, presences: { maxSize: 0 } },
  });
  ```

- **`policies.filter`** decides entry by entry: a rejected entry is not cached, and the entry already cached under
  its key is deleted.

  ```ts
  // No bot user, and no message written by a bot.
  new GatewayClient({
    intents,
    policies: {
      users: { filter: (user) => !user.bot },
      messages: { filter: (message) => !message.author.bot },
    },
  });
  ```

- **`cache: null`** caches nothing at all: `cache.get` resolves to `undefined` and `fetch` always hits the API.

  ```ts
  new GatewayClient({ intents, cache: null });
  ```

`cacheOptions` only applies to caches built by a constructor: like `cacheConstructor`, combining it with `cache` or
`makeCache` throws (those stores have their own bounds), and it is ignored with `cache: null`.

### Custom caches

`cacheConstructor` takes a class implementing `Cache`, instantiated once per entity with
`(creator, name, options)`:

- `creator` builds a structure out of raw data: it is the cache's `construct`;
- `name` is the entity's name, e.g. `"users"`;
- `options` (`CacheConstructorOptions`) carries:
  - `keyOf(data)`, the cache key of raw data. `add` **must** key its entries with it: most entities are not keyed
    by `id` (a member is keyed by guild and user, a message by channel and ID, ...);
  - `refresh(value)`, which resolves the relations of an instance again and returns it. Call it on what `get` and
    `add` hand out, or long-lived instances keep the relations of the day they were built (`member.voice` would
    not follow `VOICE_STATE_UPDATE`);
  - the entity's `cacheOptions`, i.e. `maxSize`.

The recommended way is to extend `CollectionCache`, which does all of this:

```ts
import {
  CollectionCache,
  type CacheConstructorOptions,
  type RawAPIType,
  type StructureCreator,
  type StructureMixin,
} from "@wolfstar/plugin-gateway";
import type { CacheEntityName } from "@wolfstar/plugin-cache";

class BoundedCache<
  Value extends StructureMixin<object>,
  Raw extends RawAPIType<Value> = RawAPIType<Value>,
> extends CollectionCache<Value, Raw> {
  public constructor(
    creator: StructureCreator<Value, Raw>,
    name: CacheEntityName,
    options: CacheConstructorOptions<Value, Raw>,
  ) {
    // Forward `keyOf` and `refresh`, with a default bound for the entities `cacheOptions` does not set.
    super(creator, name, { ...options, maxSize: options.maxSize ?? 10_000 });
  }
}

new GatewayClient({ intents, cacheConstructor: BoundedCache });
```

- The cache must be synchronous: structures are built synchronously from it.
- A cache that is not a `Map` cannot be enumerated, so what needs to list its entries does not work with it: the
  dispatch cascades (`GUILD_DELETE` and `CHANNEL_DELETE` leave the guild's or channel's entries behind), the
  reconciliation of guilds left while offline on `READY`, the granular emoji and sticker diff events, and
  `listCached`.
- `cacheConstructor` cannot be combined with `cache` or `makeCache` (it throws). With `cache: null`, `null` wins:
  nothing is cached and the class is never instantiated.

### Store-backed caches

`cache` and `makeCache` (`@wolfstar/plugin-cache`) keep the managers backed by raw stores, in memory or Redis,
instead of `CollectionCache`: a structure is built on every read. `makeCache` takes precedence over `cache`, and is
called once per entity kind, `null` not to cache that kind. `cacheConstructor` cannot be combined with either.

```ts
import { MemoryEntityCache } from "@wolfstar/plugin-cache";

const client = new GatewayClient({
  intents,
  // Called once per entity kind: `null` not to cache it.
  makeCache: (entity) =>
    ["guilds", "channels", "roles"].includes(entity) ? new MemoryEntityCache() : null,
  // Entry by entry, for dispatches and managers alike; `ttl` only applies to these stores.
  policies: { users: { filter: (user) => !user.bot }, messages: { ttl: () => 3_600_000 } },
  // A failing store (e.g. Redis down) is a cache miss, reported through `cacheError`.
  cacheErrors: "miss",
});
```

Swapping `createInMemoryCache()` for `createRedisCache({ redis })` changes nothing else, see
[`@wolfstar/plugin-cache`](../plugin-cache). Every feature still works without a store for an entity kind (or with
`cache: null`, for every entity), following the
[discord.js RFC #11426](https://github.com/discordjs/discord.js/issues/11426): every event is still emitted, and
the previous state of update and delete events is `null` (or a partial, see [Partials](#partials)). What else needs
a store:

| Without the store of…        | What happens                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------- |
| any entity                   | `cache.get` resolves to `undefined`, `fetch` hits the API, previous state `null` |
| `emojis` / `stickers`        | only `guildEmojisUpdate` / `guildStickersUpdate`, no granular diff events        |
| `guilds` (able to enumerate) | guilds left while offline are not reconciled on `READY`                          |
| `presences`                  | `presences.fetch` rejects: presences only come from the gateway                  |
| `roles`                      | overwrite types and member roles are read from one `GET /guilds/:id/roles`       |
| `threadMembers`              | `thread.joined` is `null` unless the payload carries the bot's member            |
| a relation's entity          | the relation getter (`message.guild`, `member.voice`, ...) returns `null`        |

`listCached` resolves to `[]` without a store, and throws a `TypeError` for a store that cannot
enumerate its entries. With `cacheErrors: "throw"`, a failing store rejects instead of missing.

### Synchronous reads

`manager.cache`'s methods are `Awaitable`: synchronous with the default `CollectionCache`, a promise with a
`@wolfstar/plugin-cache` store, unless every store the entity's relations are read from is synchronous too.
`manager.cache.synchronous` tells them apart, so a hot path such as a message filter can skip `await` when it can:

```ts
const user = client.users.cache.synchronous
  ? client.users.cache.get(userId)
  : await client.users.cache.get(userId);
```

`await` works either way, since a non-promise value resolves to itself:

```ts
client.on("messageCreate", async (message) => {
  const key = message.guildId && client.members.resolveKey(message.guildId, message.author.id);
  const member = key ? await client.members.cache.get(key) : undefined;
  if (member?.roleIds.includes(mutedRoleId)) return;
  // ...
});
```

## Resuming sessions across restarts

`@discordjs/ws` resumes a shard's session after a dropped connection, but only within the process:
every deploy or crash identifies every shard again, spending identify quota, missing the events sent
meanwhile, and triggering a full `GUILD_CREATE` burst. A `sessionStore` keeps the sessions outside
the process, so the next one resumes them and Discord replays what it missed:

```ts
import { createRedisCache, createRedisSessionStore } from "@wolfstar/plugin-cache";
import { GatewayClient } from "@wolfstar/plugin-gateway";
import { GatewayIntentBits } from "discord-api-types/v10";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);
const client = new GatewayClient({
  intents: GatewayIntentBits.Guilds | GatewayIntentBits.GuildMessages,
  cache: createRedisCache({ redis }),
  sessionStore: createRedisSessionStore({ redis }),
});

process.once("SIGTERM", async () => {
  await client.destroy({ resumable: true }); // the next process resumes the sessions
  process.exit(0);
});
```

- **Pair it with a persistent cache.** A resumed session only replays the missed events, not the
  guilds: with an in-memory cache, the default `CollectionCache` or `createInMemoryCache()`, a
  restarted process resumes with an empty cache that `GUILD_CREATE` never refills.
- **Shut down with `destroy({ resumable: true })`.** By default `destroy()` closes the connections
  with code `1000`, which makes Discord invalidate the sessions, and `@discordjs/ws` drops them from
  the store. With `resumable`, the shards close with code `4200` and their sessions stay stored.
  Both wait for the pending session writes.
- **The store is read once per shard**, when it first connects, and mirrored in memory from then on
  (`@discordjs/ws` reads the session on every dispatch and heartbeat). A read failing, or taking
  longer than `sessionStoreTimeout`, is reported as a `GatewaySessionStoreError` through `error`
  and the shard identifies, it never stalls.
- **Writes run in the background.** `@discordjs/ws` updates the session on every dispatch; the client
  never holds a dispatch back for it, and writes one session per shard at a time, collapsing the
  updates received meanwhile into a single write of the latest. On a busy shard that is still about
  one write per store round trip. After a crash, the stored sequence may be a few dispatches behind:
  the session is still resumable, and Discord replays those dispatches, which listeners then see
  twice. A failed write is reported through `error` too.
- A stale session is harmless: when Discord refuses to resume it, `@discordjs/ws` identifies. A
  session stored with another shard count (e.g. after resharding) is not resumed at all.

`sessionStore` replaces the `gateway.retrieveSessionInfo` and `gateway.updateSessionInfo` options,
passing either alongside it throws. `destroy({ resumable: true })` also works with a
`gateway.updateSessionInfo` of your own, which it does not tell to drop the sessions.

## Structures

Structures extend the ones
[`@discordjs/structures`](https://github.com/discordjs/discord.js/tree/main/packages/structures)
already ships (`User`, `Message`, `Attachment`, `Embed`, `Reaction`, `Poll`, `Emoji`, `Invite`,
`Presence`, `Activity`, `VoiceState`, `Webhook`, `Sticker`, `StickerPack`, `SoundboardSound`,
`StageInstance`, `AutoModerationRule`, and every channel type), adding relations resolved from the
cache, CDN URLs, and actions through the client. The ones it has no counterpart for yet (`Guild`,
`GuildMember`, `Role`, `ThreadMember`, `GuildScheduledEvent`, ...) extend its base `Structure`.
They live in one folder per domain, each with an `index.ts`, mirroring `@discordjs/structures`:
`automoderation/`, `channels/` (and `channels/mixins/`), `emojis/`, `guilds/`, `invites/`,
`messages/`, `polls/`, `presences/`, `soundboards/`, `stageInstances/`, `stickers/`, `users/`,
`voice/`, and `webhooks/`.

Where a getter of ours has stricter semantics (e.g. `null` or a default instead of `undefined`),
it overrides `@discordjs/structures`' one, which keeps typing it.

Channels get one class per type (`TextChannel`, `VoiceChannel`, `ForumChannel`,
`PublicThreadChannel`, `DMChannel`, ...), each extending `@discordjs/structures`' own and composed
from mixins (`GuildChannelMixin`, `ChannelTopicMixin`, `ThreadChannelMixin`, ...). `instanceof
Channel` matches any of them. `ChannelManager` picks the class matching the channel type,
`BaseChannel` covers the unknown ones. Channel mixins can supply a `DataTemplate`, an
`optimizeData` hook, and an `enrichToJSON` hook. Construction and patches optimize timestamps
across channels, messages, members, invites, events, templates, and voice states, as well as role
and overwrite permission bits. `toJSON()` retains the original API fields.

```ts
client.on("channelCreate", (channel) => {
  if (channel instanceof TextChannel) console.log(channel.name, channel.topic);
});
```

Structures never hold a reference to the client. Every channel has `fetch()` and `delete()`
(from `BaseChannelMixin`), which use `@discordjs/core` for API calls.

`Structure`, `StructureMixin`, `initStructure`, `Mixin`, `MixinTypes`, and the `kData`, `kPatch`,
and `kClone` symbols are exported, so structures can be subclassed and new mixins written:

```ts
import { Mixin, TextChannel, kData } from "@wolfstar/plugin-gateway";

class MyTextChannel extends TextChannel {}
Mixin(MyTextChannel, [MyMixin]);
```

To extend another `@discordjs/structures` class the same way, mix `StructureMixin` in and call
`initStructure` from the constructor:

```ts
import { User as BaseUser } from "@discordjs/structures";
import { initStructure, Mixin, StructureMixin } from "@wolfstar/plugin-gateway";

export interface MyUser extends StructureMixin<APIUser> {}
export class MyUser extends BaseUser {
  public constructor(data: APIUser, relations: object = {}) {
    super(data);
    initStructure(this, data, relations);
  }
}
Mixin(MyUser, [StructureMixin]);
```

> [!NOTE]
> `@discordjs/structures` does not export the symbols keying a structure's data and its
> patch/clone methods, but creates them with `Symbol.for`, so `kData`, `kPatch`, and `kClone` are the
> very same symbols, re-exported for subclasses and mixins. It is only published as `dev` snapshots
> requiring Node.js 24.17 (hence this package's `engines`).

### Guilds, emojis, stickers and invites

`Guild` has every field of the API, its CDN URLs, and discord.js's editing methods (`edit`,
`setName`, `setIcon`, `setSystemChannel`, ..., `disableInvites`, `setIncidentActions`, `leave`,
`delete`), plus `fetchOwner`, `fetchPreview`, `fetchVanityData`, and `fetchVoiceRegions`. Its
emojis, stickers, and invites have their own managers, reachable from the guild or the client:

```ts
const guild = await client.guilds.fetch(guildId);

const emoji = await guild.emojis.create({ attachment: "data:image/png;base64,...", name: "howl" });
await emoji.roles.add(roleId);

await client.guilds
  .stickers(guildId)
  .create({ file: { name: "wolf.png", data }, name: "wolf", tags: "wolf" });

const invite = await guild.invites.create(channelId, { maxAge: 3600 });
const fetched = await client.fetchInvite("https://discord.gg/wolves");
```

The client also has discord.js's `fetchSticker`, `fetchStickerPacks`, and `fetchVoiceRegions`.
`emojiCreate`/`Update`/`Delete` and the sticker events come from diffing `GUILD_EMOJIS_UPDATE` and
`GUILD_STICKERS_UPDATE` against the cache, so a client without cache only gets them through `raw`.

### Users, members and roles

They follow discord.js's API. `client.users.cache`, `client.members.cache`, and `client.roles.cache`
read synchronously with the default `CollectionCache`, like discord.js; only a `@wolfstar/plugin-cache`
store that is not synchronous (e.g. Redis) makes them asynchronous, see
[Synchronous reads](#synchronous-reads).

```ts
const member = await client.members.fetch(guildId, userId);

await member.roles.add(roleId, "verified");
await member.timeout(10 * 60_000, "spam");

const permissions = await member.fetchPermissions(); // discord.js: member.permissions
if (await member.fetchKickable()) await member.kick(); // discord.js: member.kickable

const me = await client.members.me(guildId); // discord.js: guild.members.me, null when not cached
const cached = await member.roles.cache; // a Collection of the cached roles, @everyone included
const highest = await member.roles.highest; // read from the cache, like discord.js
const fetched = await member.roles.fetchHighest(); // falls back to the API for uncached roles
await fetched?.setColors({ primaryColor: 0xff0000 });

await client.user?.setActivity("with wolves", { type: ActivityType.Competing });
await client.users.send(member, "Welcome!"); // a user, a member, a message (its author), or an ID
```

`member.roles` and `emoji.roles` are discord.js's `GuildMemberRoleManager` and
`GuildEmojiRoleManager`: `add`, `remove` and `set` take a `Role`, an ID, an array or a `Collection`,
and resolve to the updated member or emoji. Their `cache` and getters (`highest`, `hoist`, `color`,
`icon`, ...) are the one difference: they are `Awaitable`, synchronous with the default cache and a
promise with an asynchronous store, so `await` them. `highest` is `null` when no role is cached.

`client.users.createDM(user)` returns the cached direct message channel, unless `force` is set;
`client.users.dmChannel(user)` (or `user.dmChannel`) reads it, and `deleteDM` throws
`UserNoDMChannel` without one. The cached channel is found by scanning the channel cache, which is
only done on a synchronous cache that can enumerate its entries: with `cache: null` or a Redis store,
`dmChannel` is `null` and `createDM` always asks Discord, which answers with the existing channel.

`client.user` is a `ClientUser`, which edits the bot's profile and sets its presence on every shard.
`client.members` also lists, searches, adds (OAuth2), edits, kicks, bans and prunes members;
`client.roles` creates, edits, moves and deletes roles, and fetches all of a guild's roles or their
member counts. Permissions are `PermissionsBitField`s, computed like Discord does: owner and
administrators get everything, everyone else `@everyone` plus their roles. Channel overwrites
apply through `member.fetchPermissionsIn(channel)`, see below.

`client.members.request(guildId, options)` (or `guild.requestMembers(options)`, discord.js:
`guild.members.fetch()`) asks the guild's shard for its members over the gateway instead of REST:
every member by default, those matching a `query` (with a `limit`), or up to 100 `userIds`, with
their `presences` if asked. It resolves with the `GuildMember`s once Discord's last
`GUILD_MEMBERS_CHUNK` for its `nonce` is cached, so `client.members.cache.get` sees them, and rejects
with a `GuildMembersTimeoutError` when no chunk arrives for `time` milliseconds (120 seconds by
default), or a `GuildMembersRateLimitError` when Discord answers with `RATE_LIMITED`. Every chunk
is also emitted as `guildMembersChunk`, whose `data.not_found` lists the requested IDs that are
not members. Requesting every member or a query needs the `GuildMembers` intent, and presences the
`GuildPresences` one. `@discordjs/ws` keeps the requests within the gateway's rate limit.

```ts
const members = await client.members.request(guildId); // every member
const [wolf] = await client.members.request(guildId, { userIds: [userId], presences: true });
```

### Channels and permissions

Guild channels follow discord.js: `edit`, `setName`, `clone`, `delete`, and the setters of each
type (`setTopic`, `setRateLimitPerUser`, `setBitrate`, `setUserLimit`, `setAvailableTags`, ...).
`setParent` and `lockPermissions` copy the category's overwrites. `channel.permissionOverwrites`
creates, edits (keeping the permissions you do not pass), and deletes overwrites, and
`guild.channels` creates, lists, and moves channels:

```ts
const channel = await guild.channels.create({ name: "den", type: ChannelType.GuildText });
await channel.permissionOverwrites.edit(guild.id, { SendMessages: false });
await channel.permissionOverwrites.edit(roleId, { SendMessages: true });

const permissions = await channel.fetchPermissionsFor(member); // discord.js: channel.permissionsFor(member)
await member.fetchPermissionsIn(channel); // discord.js: member.permissionsIn(channel)
```

Permissions are computed like Discord does: guild permissions, then the `@everyone` overwrite, the
roles' overwrites, and the member's. Threads use their parent's overwrites. The message
`fetch*able()` checks use them too.

### Threads

Text, announcement, forum, and media channels have `threads`: `create` (a post with `message` in
forums), `fetchActive`, and `fetchArchived`. Threads have `setArchived`, `setLocked`,
`setInvitable`, `setAutoArchiveDuration`, `setAppliedTags`, `join`, `leave`,
`fetchStarterMessage`, `fetchOwner`, and `members`, backed by `client.threadMembers` and its
`ThreadMember`s. `threadListSync`, `threadMemberUpdate`, and `threadMembersUpdate` are emitted.

```ts
const thread = await channel.threads.create({ name: "hunt", type: ChannelType.PrivateThread });
await thread.members.add(userId);
await thread.setArchived(true);

const post = await forum.threads.create({
  name: "Pack news",
  message: "Awoo",
  appliedTags: [tagId],
});
```

### Voice states and presences

`client.voiceStates` and `client.presences` read the voice states and presences the gateway sends
(with the `GuildVoiceStates` and `GuildPresences` intents). `VoiceState` mutes, deafens, moves,
and disconnects members, and handles stage channels (`setSuppressed`, `setRequestToSpeak`).
`Presence` has the status and `Activity`s, with their `RichPresenceAssets` URLs. Members have
`fetchVoiceState()` and `fetchPresence()` (discord.js: `member.voice`, `member.presence`).

```ts
client.on("voiceStateUpdate", (oldState, newState) => {
  if (!oldState?.channelId && newState.channelId)
    console.log(newState.member?.displayName, "joined");
});

const voice = await member.fetchVoiceState();
await voice?.setChannel(afkChannelId, "idle");
```

### Moderation

`guild.bans` lists, fetches (with the reason, which the gateway does not send), creates, and
removes bans. `guild.fetchAuditLogs()` returns a page of `GuildAuditLogsEntry`s with their
executors, and `guild.autoModerationRules` manages `AutoModerationRule`s, whose setters
(`setKeywordFilter`, `setAllowList`, ...) keep the rest of the trigger:

```ts
const { entries } = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 10 });
for (const entry of entries) console.log(entry.executor?.username, entry.targetId, entry.reason);

const rule = await guild.autoModerationRules.fetch(ruleId);
await rule.setKeywordFilter(["awoo"]);
```

### Scheduled events, stages, and soundboard

`guild.scheduledEvents` creates, edits, and deletes `GuildScheduledEvent`s and fetches their
subscribers. Stage channels have `createStageInstance` and `fetchStageInstance` (a
`StageInstance`, managed by `guild.stageInstances`). `guild.soundboardSounds` uploads and edits
`SoundboardSound`s, `client.fetchDefaultSoundboardSounds()` lists Discord's own, and voice channels
play them with `sendSoundboardSound`.

```ts
const event = await guild.scheduledEvents.create({
  name: "Full moon",
  scheduledStartTime: Date.now() + 86_400_000,
  scheduledEndTime: Date.now() + 90_000_000,
  privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
  entityType: GuildScheduledEventEntityType.External,
  entityMetadata: { location: "The den" },
});
await event.setStatus(GuildScheduledEventStatus.Active);
```

### Integrations, templates, welcome screen, widget, and onboarding

`guild.integrations` lists and removes `Integration`s, cached from the `INTEGRATION_*` dispatches.
`client.templates` manages `GuildTemplate`s (`guild.fetchTemplates()`, `guild.createTemplate()`,
`client.fetchGuildTemplate(code)`, `template.sync()`, `template.createGuild()`). Guilds fetch and
edit their `WelcomeScreen`, their widget settings (`setWidgetSettings` patches `widgetEnabled` and
`widgetChannelId`), and their `GuildOnboarding`, whose new prompts and options get placeholder IDs
like discord.js's. `client.fetchGuildWidget(guildId)` returns the public `Widget`. Apart from
integrations, Discord sends none of these over the gateway, so they are not cached.

```ts
await guild.editWelcomeScreen({
  enabled: true,
  welcomeChannels: [{ channel: rulesId, description: "Read me", emoji: "🐺" }],
});
const widget = await client.fetchGuildWidget(guild.id);
console.log(widget.presenceCount, widget.imageURL(GuildWidgetStyle.Banner2));
```

### Webhooks

`client.webhooks` fetches, creates, edits, and deletes webhooks, and posts with their token, without
the bot's authorization. Text, announcement, voice, stage, forum, and media channels have
`fetchWebhooks` and `createWebhook`, guilds `fetchWebhooks`, and announcement channels
`addFollower`. Webhooks are not cached: Discord only says that they changed (`webhooksUpdate`).

```ts
const webhook = await channel.createWebhook({ name: "Howler" });
const message = await webhook.send({ content: "Awoo", username: "Pack" });
await webhook.editMessage(message.id, "Awoo!");

const fetched = await client.fetchWebhook(webhookId, token); // no bot authorization needed
```

### Messages

`Message` follows discord.js: `attachments`, `embeds`, `mentions` (`MessageMentions`), `reactions`
(`ReactionManager`), `poll` (`Poll`), `flags`, `cleanContent`, and the actions `reply`, `edit`,
`delete`, `forward`, `pin`, `react`, `crosspost`, `startThread`, `suppressEmbeds`. Relations are
fetched: `fetchChannel`, `fetchGuild`, `fetchReference`, and `fetchDeletable` & co. instead of
discord.js's `deletable`. Text channels get `messages`, `send`, `sendTyping`, and `bulkDelete`.

As in discord.js, `attachments`, `stickers`, `messageSnapshots`, and `reactions.cache` are
`Collection`s keyed by ID (reactions by the ID of a custom emoji, the name of a Unicode one), while
`embeds` and `components` are arrays. `react()` resolves to the `MessageReaction`, counting the bot.
`partial` is `true` for a message lacking its content or its author. Every structure is valued by
its ID (`valueOf()`), like discord.js's `Base`:

```ts
const channel = await client.channels.fetch(channelId);
if (channel instanceof TextChannel) {
  await channel.sendTyping();
  const message = await channel.send({
    content: "Awoo",
    poll: { question: { text: "Best pack?" }, answers },
  });
  const reaction = await message.react("🐺");
  console.log(reaction.count, message.attachments.first()?.url);
  const voters = await message.poll?.answers[0]?.fetchVoters();
  await channel.bulkDelete(10, true);
}

const { items } = await client.messages.fetchPins(channelId);
const users = await message.reactions.resolve("🐺")?.users.fetch();
```

## Errors

Like discord.js's `DiscordjsError`, every error the package throws or emits carries a `code` from
`GatewayErrorCodes`, and its message comes from `GatewayErrorMessages`. `GatewayError`,
`GatewayTypeError`, and `GatewayRangeError` extend `Error`, `TypeError`, and `RangeError`, and are
named after their code (`GatewayError [WebhookTokenUnavailable]`). The errors with extra data
(`DispatchTimeoutError`, `GuildMembersTimeoutError`, `GuildMembersRateLimitError`, and
`GatewaySessionStoreError`) extend `GatewayError`.

```typescript
import { GatewayError, GatewayErrorCodes } from "@wolfstar/plugin-gateway";

try {
  await webhook.send("Awoo");
} catch (error) {
  if (error instanceof GatewayError && error.code === GatewayErrorCodes.WebhookTokenUnavailable) {
    // The webhook was fetched without its token.
  }
}
```

## Limitations

- A `GatewayClient` connects its gateway shards from a single process (`@discordjs/ws`'s
  `WorkerShardingStrategy` can be set through `gateway.buildStrategy`). To spread them across
  processes, use [`@wolfstar/plugin-sharder`](../plugin-sharder) and spread
  `shardClient.gatewayOptions` into the client's options.
- Interaction payloads keep being handled as today, they do not read through `client.users` & co.

## Credits

The error system (`src/errors/`) is adapted from discord.js's
[`errors`](https://github.com/discordjs/discord.js/tree/main/packages/discord.js/src/errors)
module, Copyright 2021 Noel Buechler and Copyright 2015 Amish Shah, licensed under the
[Apache License 2.0](https://github.com/discordjs/discord.js/blob/main/packages/discord.js/LICENSE).
The structures and managers follow discord.js's API as well.
