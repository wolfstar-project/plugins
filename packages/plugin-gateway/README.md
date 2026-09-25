<div align="center">

<img src="https://cdn.wolfstar.rocks/wolfstar-assets/wolfstar.png" alt="WolfStar" width="100" />

# @wolfstar/plugin-gateway

**Discord gateway support for `@wolfstar/http-framework`.**

[![version](https://npmx.dev/api/registry/badge/version/@wolfstar/plugin-gateway)](https://npmx.dev/package/@wolfstar/plugin-gateway)
[![downloads](https://npmx.dev/api/registry/badge/downloads/@wolfstar/plugin-gateway)](https://npmx.dev/package/@wolfstar/plugin-gateway)
[![license](https://img.shields.io/github/license/wolfstar-project/plugins?style=flat-square&color=informational)](https://github.com/wolfstar-project/plugins/blob/main/LICENSE)

</div>

## Description

[`@wolfstar/http-framework`](https://www.npmjs.com/package/@wolfstar/http-framework) only speaks to
Discord through the interactions endpoint. This package adds the other half, specified in
[wolfstar-project/plugins#54](https://github.com/wolfstar-project/plugins/issues/54): a
`GatewayClient` that **extends** the framework's `Client`, so commands, interaction handlers,
listeners, `load()`, and `listen()` keep working unchanged, and adds on top:

- a gateway connection, through [`@discordjs/ws`](https://www.npmjs.com/package/@discordjs/ws)
  (resumes, reconnects, identify rate limits, and sharding included);
- events carrying **structures** (`Message`, `User`, `Guild`, ...) rather than raw payloads;
- managers (`client.users`, `client.guilds`, ...) reading from an optional
  [`@wolfstar/plugin-cache`](../plugin-cache) cache, and falling back to the REST API;
- `EventGatewayListener`, to handle gateway events from the `listeners` directory.

> [!NOTE]
> A gateway connection is long-lived: a `GatewayClient` needs a persistent process, unlike a bot
> only serving HTTP interactions.

## Installation

```bash
pnpm add @wolfstar/plugin-gateway @wolfstar/plugin-cache
```

## Usage

```ts
import { createInMemoryCache } from "@wolfstar/plugin-cache";
import { GatewayClient } from "@wolfstar/plugin-gateway";
import { GatewayIntentBits } from "discord-api-types/v10";

const client = new GatewayClient({
  intents:
    GatewayIntentBits.Guilds | GatewayIntentBits.GuildMessages | GatewayIntentBits.MessageContent,
  cache: createInMemoryCache(),
});

client.on("messageCreate", async (message) => {
  const guild = message.guildId ? await client.guilds.get(message.guildId) : undefined;
  console.log(`${message.author.username} in ${guild?.name ?? "a DM"}: ${message.content}`);
});

await client.load(); // commands, interaction handlers, and listeners, as usual
await client.connect(); // the gateway
await client.listen({ port: 8080 }); // the interactions endpoint, as usual
```

### Options

On top of the `Client` options:

| Option            | Default     | Description                                                                                                       |
| ----------------- | ----------- | ----------------------------------------------------------------------------------------------------------------- |
| `intents`         | —           | The gateway intents.                                                                                              |
| `cache`           | `undefined` | A `Cache` from `@wolfstar/plugin-cache`, see [Caching](#caching).                                                 |
| `shardCount`      | `null`      | Total shards across every process, `null` for Discord's recommendation.                                           |
| `shardIds`        | `null`      | The shards this client runs, as an array or a `{ start, end }` range. `null` for all.                             |
| `gateway`         | `{}`        | Extra `@discordjs/ws` `WebSocketManager` options (`compression`, `initialPresence`, ...).                         |
| `cacheFailure`    | `"skip"`    | On a cache read/write failure, `"skip"` drops the event, `"emitUncached"` emits it from the payload.              |
| `dispatchTimeout` | `30_000`    | Milliseconds after which a dispatch still processing is reported as a `DispatchTimeoutError`. `null` disables it. |

`client.gateway` exposes the underlying `WebSocketManager`, e.g. to send presence updates.

## Events

| Event                                                     | Arguments                                      |
| --------------------------------------------------------- | ---------------------------------------------- |
| `raw`                                                     | `payload`, `shardId` — every dispatch          |
| `shardReady`                                              | `shardId`, `user`                              |
| `shardResume` / `shardClose` / `shardError`               | `shardId` / `shardId, code` / `error, shardId` |
| `guildCreate`                                             | `guild`                                        |
| `guildUpdate`                                             | `oldGuild \| null`, `newGuild`                 |
| `guildDelete`                                             | `guild \| null`, `data`                        |
| `channelCreate` / `channelDelete`                         | `channel`                                      |
| `channelUpdate`                                           | `oldChannel \| null`, `newChannel`             |
| `threadCreate` / `threadUpdate` / `threadDelete`          | same shapes as channels                        |
| `threadListSync`                                          | `threads`, `members`, `data`                   |
| `threadMemberUpdate`                                      | `oldMember \| null`, `newMember`               |
| `threadMembersUpdate`                                     | `added`, `removed`, `thread \| null`, `data`   |
| `messageCreate`                                           | `message`                                      |
| `messageUpdate`                                           | `oldMessage \| null`, `newMessage`             |
| `messageDelete`                                           | `message \| null`, `data`                      |
| `messageDeleteBulk`                                       | `messages`, `data`                             |
| `messageReactionAdd` / `messageReactionRemove`            | `reaction`, `user \| null`, `details`          |
| `messageReactionRemoveAll`                                | `message \| null`, `reactions`, `data`         |
| `messageReactionRemoveEmoji`                              | `reaction`                                     |
| `messagePollVoteAdd` / `messagePollVoteRemove`            | `answer`, `userId`                             |
| `guildMemberAdd`                                          | `member`                                       |
| `guildMemberUpdate`                                       | `oldMember \| null`, `newMember`               |
| `guildMemberRemove`                                       | `member \| null`, `data`                       |
| `guildRoleCreate` / `guildRoleUpdate` / `guildRoleDelete` | same shapes as members                         |
| `userUpdate`                                              | `oldUser \| null`, `newUser`                   |
| `emojiCreate` / `emojiDelete`                             | `emoji`                                        |
| `emojiUpdate`                                             | `oldEmoji`, `newEmoji`                         |
| `stickerCreate` / `stickerDelete`                         | `sticker`                                      |
| `stickerUpdate`                                           | `oldSticker`, `newSticker`                     |
| `inviteCreate`                                            | `invite`                                       |
| `inviteDelete`                                            | `invite \| null`, `data`                       |
| `voiceStateUpdate`                                        | `oldState \| null`, `newState`                 |
| `presenceUpdate`                                          | `oldPresence \| null`, `newPresence`           |
| `guildScheduledEventCreate` / `guildScheduledEventDelete` | `event`                                        |
| `guildScheduledEventUpdate`                               | `oldEvent \| null`, `newEvent`                 |
| `guildScheduledEventUserAdd` / `...UserRemove`            | `event \| null`, `user \| null`, `data`        |
| `stageInstanceCreate` / `stageInstanceDelete`             | `stageInstance`                                |
| `stageInstanceUpdate`                                     | `oldStageInstance \| null`, `newStageInstance` |
| `guildSoundboardSoundCreate`                              | `sound`                                        |
| `guildSoundboardSoundUpdate`                              | `oldSound \| null`, `newSound`                 |
| `guildSoundboardSoundDelete`                              | `sound \| null`, `data`                        |
| `guildSoundboardSoundsUpdate` / `soundboardSounds`        | `sounds`, `guildId`                            |
| `guildBanAdd` / `guildBanRemove`                          | `ban`                                          |
| `guildAuditLogEntryCreate`                                | `entry`                                        |
| `autoModerationRuleCreate` / `autoModerationRuleDelete`   | `rule`                                         |
| `autoModerationRuleUpdate`                                | `oldRule \| null`, `newRule`                   |
| `autoModerationActionExecution`                           | `execution`                                    |
| `guildIntegrationsUpdate`                                 | `guild \| null`, `data`                        |
| `integrationCreate`                                       | `integration`                                  |
| `integrationUpdate`                                       | `oldIntegration \| null`, `newIntegration`     |
| `integrationDelete`                                       | `integration \| null`, `data`                  |

The previous state of update events and the entity of delete events come from the cache, and are
`null` when it was not cached (or when the client has no cache). `data` is the raw dispatch data,
which always identifies the deleted entity.

The mapping lives in a single declarative table, `DispatchHandlers`. Dispatches it does not cover
are still written to the cache and emitted as `raw`. `INTERACTION_CREATE` is never processed:
interactions are served by the HTTP endpoint.

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

## Caching

The cache only holds raw API data, managers build the structures:

| Manager           | `get` / `fetch` / `refresh` arguments |
| ----------------- | ------------------------------------- |
| `client.users`    | `userId`                              |
| `client.guilds`   | `guildId`                             |
| `client.channels` | `channelId` (threads included)        |
| `client.threads`  | `threadId`                            |
| `client.messages` | `channelId`, `messageId`              |
| `client.members`  | `guildId`, `userId`                   |
| `client.roles`    | `guildId`, `roleId`                   |

- `get` only reads the cache, resolving to `undefined` on a miss;
- `fetch` reads the cache, falling back to the REST API (and caching the result). Pass
  `{ force: true }` after the IDs to always hit the API, `{ cache: false }` not to store the result:
  `client.messages.fetch(channelId, messageId, { force: true })`;
- `refresh` is `fetch` with `{ force: true }`;
- `resolve` takes a structure (returned as is) or a cache key, like discord.js's `resolve`.

Like discord.js's `CachedManager#_add`, every API payload goes through the manager's `_add`, which
merges it into the cached entry (the fields a partial payload lacks keep their cached value) and
builds the structure. Relations are resolved from the cache too: `message.author` is the entry of
`client.users`, `message.member` the one of `client.members`, and the same goes for
`member.user`, `emoji.author`, `sticker.user`, and `invite.inviter`. Every structure of a guild
(channels, threads, members, roles, messages, emojis, stickers, invites) has `guild`, the cached
guild, and messages have `channel`. These are `null` when the entity is not cached; `fetchGuild()`
and `fetchChannel()` always get it. `_add` is asynchronous,
since the cache can be Redis. A structure built by hand, with `new Message(data)`, falls back to
the copy embedded in its payload.

Swapping `createInMemoryCache()` for `createRedisCache({ redis })` changes nothing else, see
[`@wolfstar/plugin-cache`](../plugin-cache).

## Structures

`User`, `Guild`, `Message`, `GuildMember`, and `Role` wrap the raw data behind typed getters.
Channels get one class per type (`TextChannel`, `VoiceChannel`, `ForumChannel`,
`PublicThreadChannel`, `DMChannel`, ...), all extending `Channel` and composed from mixins
(`GuildChannelMixin`, `ChannelTopicMixin`, `ThreadChannelMixin`, ...), following
`@discordjs/structures` and the layout of discord.js's `@discordjs/next` prototype.
`ChannelManager` picks the class matching the channel type, `BaseChannel` covers the unknown ones.

```ts
client.on("channelCreate", (channel) => {
  if (channel instanceof TextChannel) console.log(channel.name, channel.topic);
});
```

Structures never hold a reference to the client. Every channel has `fetch()` and `delete()`
(from `BaseChannelMixin`), which go through the framework's REST client.

`Structure`, `Mixin`, and the `kData`, `kPatch`, and `kClone` symbols are exported, so structures
can be subclassed and new mixins written:

```ts
import { Mixin, TextChannel, kData } from "@wolfstar/plugin-gateway";

class MyTextChannel extends TextChannel {}
Mixin(MyTextChannel, [MyMixin]);
```

> [!NOTE]
> `Structure` extends
> [`@discordjs/structures`](https://github.com/discordjs/discord.js/tree/main/packages/structures)'
> own base class. That package does not export the symbols keying a structure's data and its
> patch/clone methods, but creates them with `Symbol.for`, so `kData`, `kPatch`, and `kClone` are the
> very same symbols, re-exported for subclasses and mixins. It is only published as `dev` snapshots
> requiring Node.js 24.17 (hence this package's `engines`), and has no `Guild` nor `GuildMember`
> yet: the structures here are this package's own, following its conventions.

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

They follow discord.js's API, with one difference: anything discord.js reads synchronously from its
cache is asynchronous here, since the cache can be Redis.

```ts
const member = await client.members.fetch(guildId, userId);

await member.roles.add(roleId, "verified");
await member.timeout(10 * 60_000, "spam");

const permissions = await member.fetchPermissions(); // discord.js: member.permissions
if (await member.fetchKickable()) await member.kick(); // discord.js: member.kickable

const highest = await member.roles.fetchHighest(); // discord.js: member.roles.highest
await highest?.setColors({ primaryColor: 0xff0000 });

await client.user?.setActivity("with wolves", { type: ActivityType.Competing });
await (await client.users.fetch(userId)).send("Welcome!");
```

`client.user` is a `ClientUser`, which edits the bot's profile and sets its presence on every shard.
`client.members` also lists, searches, adds (OAuth2), edits, kicks, bans and prunes members;
`client.roles` creates, edits, moves and deletes roles, and fetches all of a guild's roles or their
member counts. Permissions are `PermissionsBitField`s, computed like Discord does: owner and
administrators get everything, everyone else `@everyone` plus their roles. Channel overwrites
apply through `member.fetchPermissionsIn(channel)`, see below.

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

`client.webhooks` fetches, creates, edits, and deletes webhooks, and posts with their token like
discord.js's `WebhookClient`. Text, announcement, voice, stage, forum, and media channels have
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
discord.js's `deletable`. Text channels get `messages`, `send`, `sendTyping`, and `bulkDelete`:

```ts
const channel = await client.channels.fetch(channelId);
if (channel instanceof TextChannel) {
  await channel.sendTyping();
  const message = await channel.send({
    content: "Awoo",
    poll: { question: { text: "Best pack?" }, answers },
  });
  await message.react("🐺");
  const voters = await message.poll?.answers[0]?.fetchVoters();
  await channel.bulkDelete(10, true);
}

const { items } = await client.messages.fetchPins(channelId);
const users = await message.reactions.resolve("🐺")?.users.fetch();
```

## Subpath exports

Like `@discordjs/next`, the gateway and REST libraries are re-exported, so a bot does not need to
depend on them directly:

| Import                          | Re-exports        |
| ------------------------------- | ----------------- |
| `@wolfstar/plugin-gateway/rest` | `@discordjs/rest` |
| `@wolfstar/plugin-gateway/ws`   | `@discordjs/ws`   |

## Limitations

- A `GatewayClient` connects its gateway shards from a single process (`@discordjs/ws`'s
  `WorkerShardingStrategy` can be set through `gateway.buildStrategy`). To spread them across
  processes, use [`@wolfstar/plugin-sharder`](../plugin-sharder) and spread
  `shardClient.gatewayOptions` into the client's options.
- Interaction payloads keep being handled as today, they do not read through `client.users` & co.
