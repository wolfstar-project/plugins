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

| Option       | Default     | Description                                                                               |
| ------------ | ----------- | ----------------------------------------------------------------------------------------- |
| `intents`    | —           | The gateway intents.                                                                      |
| `cache`      | `undefined` | A `Cache` from `@wolfstar/plugin-cache`, see [Caching](#caching).                         |
| `shardCount` | `null`      | Total shards across every process, `null` for Discord's recommendation.                   |
| `shardIds`   | `null`      | The shards this client runs, as an array or a `{ start, end }` range. `null` for all.     |
| `gateway`    | `{}`        | Extra `@discordjs/ws` `WebSocketManager` options (`compression`, `initialPresence`, ...). |

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
| `messageCreate`                                           | `message`                                      |
| `messageUpdate`                                           | `oldMessage \| null`, `newMessage`             |
| `messageDelete`                                           | `message \| null`, `data`                      |
| `messageDeleteBulk`                                       | `messages`, `data`                             |
| `guildMemberAdd`                                          | `member`                                       |
| `guildMemberUpdate`                                       | `oldMember \| null`, `newMember`               |
| `guildMemberRemove`                                       | `member \| null`, `data`                       |
| `guildRoleCreate` / `guildRoleUpdate` / `guildRoleDelete` | same shapes as members                         |
| `userUpdate`                                              | `oldUser \| null`, `newUser`                   |

The previous state of update events and the entity of delete events come from the cache, and are
`null` when it was not cached (or when the client has no cache). `data` is the raw dispatch data,
which always identifies the deleted entity.

The mapping lives in a single declarative table, `DispatchHandlers`. Dispatches it does not cover
are still written to the cache and emitted as `raw`. `INTERACTION_CREATE` is never processed:
interactions are served by the HTTP endpoint.

Dispatches are processed one at a time per shard, so an asynchronous cache never reorders them.

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
- `fetch` reads the cache, falling back to the REST API (and caching the result);
- `refresh` always hits the REST API, then updates the cache.

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
> The RFC planned to build on
> [`@discordjs/structures`](https://github.com/discordjs/discord.js/tree/main/packages/structures).
> It is only published as `dev` snapshots, requires Node.js 24.17, does not export its data symbols
> (making subclasses impossible outside discord.js), and has no `Guild` nor `GuildMember` yet, so
> this package ships a small `Structure` and `Mixin` modelled after it instead.

## Subpath exports

Like `@discordjs/next`, the gateway and REST libraries are re-exported, so a bot does not need to
depend on them directly:

| Import                          | Re-exports        |
| ------------------------------- | ----------------- |
| `@wolfstar/plugin-gateway/rest` | `@discordjs/rest` |
| `@wolfstar/plugin-gateway/ws`   | `@discordjs/ws`   |

## Limitations

- Sharding is single-process by default. `@discordjs/ws`'s `WorkerShardingStrategy` can be set
  through `gateway.buildStrategy`, but multi-process setups are not covered yet.
- Interaction payloads keep being handled as today, they do not read through `client.users` & co.
