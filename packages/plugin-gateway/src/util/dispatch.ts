import {
  GatewayDispatchEvents,
  type APIPartialEmoji,
  type GatewayDispatchPayload,
  type GatewayMessagePollVoteDispatchData,
} from "discord-api-types/v10";
import type { Awaitable, CacheEntityTypes } from "@wolfstar/plugin-cache";
import type { GatewayClient } from "../GatewayClient.js";
import { ClientUser } from "../structures/ClientUser.js";
import { kPatch } from "../structures/Structure.js";
import type { GuildEmoji } from "../structures/GuildEmoji.js";
import { GuildInvite } from "../structures/GuildInvite.js";
import type { Sticker } from "../structures/Sticker.js";
import { MessageReaction } from "../structures/MessageReaction.js";
import { PollAnswer } from "../structures/PollAnswer.js";
import { Typing } from "../structures/Typing.js";
import type { GatewayEventMap, GatewayEventName } from "./events.js";

/**
 * The data of the dispatch of type `Type`.
 */
export type DispatchData<Type extends GatewayDispatchEvents> = Extract<
  GatewayDispatchPayload,
  { t: Type }
>["d"];

/**
 * Describes how a gateway dispatch turns into a {@link GatewayEventMap} event.
 *
 * @typeParam Type The dispatch type.
 * @typeParam Event The event emitted for it.
 */
export interface DispatchHandler<
  Type extends GatewayDispatchEvents,
  Event extends GatewayEventName,
> {
  /**
   * The event to emit.
   */
  event: Event;
  /**
   * Runs before the dispatch is written to the cache, used to read the previous state of the entity.
   */
  before?(client: GatewayClient, data: DispatchData<Type>): Promise<unknown>;
  /**
   * Runs after the dispatch is written to the cache, and builds the arguments of the event.
   *
   * @param state The value `before` resolved to, if any.
   */
  build(
    client: GatewayClient,
    data: DispatchData<Type>,
    state: any,
    shardId: number,
  ): Awaitable<GatewayEventMap[Event]>;
}

/**
 * An event with its arguments, as emitted by a {@link MultiDispatchHandler}.
 */
export type GatewayEventTuple = {
  [Event in GatewayEventName]: [event: Event, ...args: GatewayEventMap[Event]];
}[GatewayEventName];

/**
 * Describes how a gateway dispatch turns into any number of {@link GatewayEventMap} events, e.g. one per emoji a
 * `GUILD_EMOJIS_UPDATE` changes.
 */
export interface MultiDispatchHandler<Type extends GatewayDispatchEvents> {
  /**
   * Runs before the dispatch is written to the cache, used to read the previous state.
   */
  before?(client: GatewayClient, data: DispatchData<Type>): Promise<unknown>;
  /**
   * Runs after the dispatch is written to the cache, and lists the events to emit, in order.
   */
  emit(client: GatewayClient, data: DispatchData<Type>, state: any): Awaitable<GatewayEventTuple[]>;
}

/**
 * A {@link DispatchHandler} for the dispatch of type `Type`, emitting any event.
 */
export type AnyDispatchHandler<Type extends GatewayDispatchEvents> = {
  [Event in GatewayEventName]: DispatchHandler<Type, Event>;
}[GatewayEventName];

/**
 * The table mapping every supported dispatch to its event.
 *
 * @remarks
 * `INTERACTION_CREATE` is deliberately absent: interactions are served by the HTTP endpoint, and the gateway may
 * deliver some of them as well. Dispatches without an entry are still written to the cache and emitted as `raw`.
 */
export const DispatchHandlers: { [Type in GatewayDispatchEvents]?: AnyDispatchHandler<Type> } = {
  [GatewayDispatchEvents.Ready]: {
    event: "shardReady",
    build: (client, data, _state, shardId) => {
      const user = new ClientUser(data.user);
      client.user = user;
      return [shardId, user];
    },
  },

  [GatewayDispatchEvents.GuildCreate]: {
    event: "guildCreate",
    // The cached entry has the collections stripped, prefer it over the (much larger) payload.
    build: async (client, data) => [
      (await cachedOrUndefined(client.guilds.get(data.id))) ??
        (await client.guilds.hydrate(data as CacheEntityTypes["guilds"])),
    ],
  },
  [GatewayDispatchEvents.GuildUpdate]: {
    event: "guildUpdate",
    before: (client, data) => client.guilds.get(data.id),
    build: async (client, data, previous) => [previous ?? null, await client.guilds.hydrate(data)],
  },
  [GatewayDispatchEvents.GuildDelete]: {
    event: "guildDelete",
    before: (client, data) => client.guilds.get(data.id),
    build: (_client, data, previous) => [previous ?? null, data],
  },

  [GatewayDispatchEvents.ChannelCreate]: {
    event: "channelCreate",
    build: async (client, data) => [await client.channels.hydrate(data)],
  },
  [GatewayDispatchEvents.ChannelUpdate]: {
    event: "channelUpdate",
    before: (client, data) => client.channels.get(data.id),
    build: async (client, data, previous) => [
      previous ?? null,
      await client.channels.hydrate(data),
    ],
  },
  [GatewayDispatchEvents.ChannelDelete]: {
    event: "channelDelete",
    build: async (client, data) => [await client.channels.hydrate(data)],
  },

  [GatewayDispatchEvents.ChannelPinsUpdate]: {
    event: "channelPinsUpdate",
    build: (_client, data) => [data],
  },
  [GatewayDispatchEvents.WebhooksUpdate]: {
    event: "webhooksUpdate",
    build: (_client, data) => [data],
  },

  [GatewayDispatchEvents.ThreadCreate]: {
    event: "threadCreate",
    build: async (client, data) => [await client.threads.hydrate(data)],
  },
  [GatewayDispatchEvents.ThreadUpdate]: {
    event: "threadUpdate",
    before: (client, data) => client.threads.get(data.id),
    build: async (client, data, previous) => [previous ?? null, await client.threads.hydrate(data)],
  },
  [GatewayDispatchEvents.ThreadDelete]: {
    event: "threadDelete",
    before: (client, data) => client.threads.get(data.id),
    build: (_client, data, previous) => [previous ?? null, data],
  },

  [GatewayDispatchEvents.MessageCreate]: {
    event: "messageCreate",
    build: async (client, data) => [await client.messages.hydrate(data)],
  },
  [GatewayDispatchEvents.MessageUpdate]: {
    event: "messageUpdate",
    before: (client, data) => client.messages.get(data.channel_id, data.id),
    build: async (client, data, previous) => [
      previous ?? null,
      await client.messages.hydrate(data),
    ],
  },
  [GatewayDispatchEvents.MessageDelete]: {
    event: "messageDelete",
    before: (client, data) => client.messages.get(data.channel_id, data.id),
    build: (_client, data, previous) => [previous ?? null, data],
  },
  [GatewayDispatchEvents.MessageDeleteBulk]: {
    event: "messageDeleteBulk",
    before: async (client, data) => {
      const messages = await Promise.all(
        data.ids.map((id) => client.messages.get(data.channel_id, id)),
      );
      return messages.filter((message) => message !== undefined);
    },
    build: (_client, data, previous) => [previous ?? [], data],
  },

  [GatewayDispatchEvents.MessageReactionAdd]: {
    event: "messageReactionAdd",
    build: async (client, data) => [
      await reactionOf(client, data),
      (await cachedOrUndefined(client.users.get(data.user_id))) ?? null,
      { userId: data.user_id, type: data.type, burst: data.burst },
    ],
  },
  [GatewayDispatchEvents.MessageReactionRemove]: {
    event: "messageReactionRemove",
    build: async (client, data) => [
      await reactionOf(client, data),
      (await cachedOrUndefined(client.users.get(data.user_id))) ?? null,
      { userId: data.user_id, type: data.type, burst: data.burst },
    ],
  },
  [GatewayDispatchEvents.MessageReactionRemoveAll]: {
    event: "messageReactionRemoveAll",
    before: async (client, data) =>
      (await client.messages.get(data.channel_id, data.message_id))?.reactions.cache ?? [],
    build: async (client, data, previous: MessageReaction[] | undefined) => [
      (await cachedOrUndefined(client.messages.get(data.channel_id, data.message_id))) ?? null,
      previous ?? [],
      data,
    ],
  },
  [GatewayDispatchEvents.MessageReactionRemoveEmoji]: {
    event: "messageReactionRemoveEmoji",
    before: async (client, data) =>
      (await client.messages.get(data.channel_id, data.message_id))?.reactions.resolve(
        data.emoji,
      ) ?? undefined,
    build: (_client, data, previous: MessageReaction | undefined) => [
      previous ?? partialReaction(data),
    ],
  },
  [GatewayDispatchEvents.MessagePollVoteAdd]: {
    event: "messagePollVoteAdd",
    build: async (client, data) => [await pollAnswerOf(client, data), data.user_id],
  },
  [GatewayDispatchEvents.MessagePollVoteRemove]: {
    event: "messagePollVoteRemove",
    build: async (client, data) => [await pollAnswerOf(client, data), data.user_id],
  },

  [GatewayDispatchEvents.GuildMemberAdd]: {
    event: "guildMemberAdd",
    build: async (client, data) => [await client.members.hydrate(data)],
  },
  [GatewayDispatchEvents.GuildMemberUpdate]: {
    event: "guildMemberUpdate",
    before: (client, data) => client.members.get(data.guild_id, data.user.id),
    // The payload is partial: prefer the cached entry, which it was merged into.
    build: async (client, data, previous) => [
      previous ?? null,
      (await cachedOrUndefined(client.members.get(data.guild_id, data.user.id))) ??
        (await client.members.hydrate(data as CacheEntityTypes["members"])),
    ],
  },
  [GatewayDispatchEvents.GuildMemberRemove]: {
    event: "guildMemberRemove",
    before: (client, data) => client.members.get(data.guild_id, data.user.id),
    build: (_client, data, previous) => [previous ?? null, data],
  },

  [GatewayDispatchEvents.GuildRoleCreate]: {
    event: "guildRoleCreate",
    build: async (client, data) => [
      await client.roles.hydrate({ ...data.role, guild_id: data.guild_id }),
    ],
  },
  [GatewayDispatchEvents.GuildRoleUpdate]: {
    event: "guildRoleUpdate",
    before: (client, data) => client.roles.get(data.guild_id, data.role.id),
    build: async (client, data, previous) => [
      previous ?? null,
      await client.roles.hydrate({ ...data.role, guild_id: data.guild_id }),
    ],
  },
  [GatewayDispatchEvents.GuildRoleDelete]: {
    event: "guildRoleDelete",
    before: (client, data) => client.roles.get(data.guild_id, data.role_id),
    build: (_client, data, previous) => [previous ?? null, data],
  },

  [GatewayDispatchEvents.InviteCreate]: {
    event: "inviteCreate",
    build: async (client, data) => [
      data.guild_id
        ? await client.guilds.invites(data.guild_id).hydrate(data)
        : new GuildInvite(data),
    ],
  },
  [GatewayDispatchEvents.InviteDelete]: {
    event: "inviteDelete",
    before: async (client, data) =>
      data.guild_id ? client.guilds.invites(data.guild_id).get(data.code) : undefined,
    build: (_client, data, previous) => [previous ?? null, data],
  },

  [GatewayDispatchEvents.TypingStart]: {
    event: "typingStart",
    build: (_client, data) => [new Typing(data)],
  },
  [GatewayDispatchEvents.VoiceServerUpdate]: {
    event: "voiceServerUpdate",
    build: (_client, data) => [data],
  },

  [GatewayDispatchEvents.UserUpdate]: {
    event: "userUpdate",
    before: (client, data) => client.users.get(data.id),
    build: async (client, data, previous) => {
      // The bot's own updates keep `client.user` a `ClientUser`, with its presence.
      if (client.user?.id === data.id) {
        client.user[kPatch](data);
        return [previous ?? null, client.user];
      }

      return [previous ?? null, await client.users.hydrate(data)];
    },
  },
};

/**
 * The table of the dispatches that turn into several events, diffed against the cache.
 *
 * @remarks
 * Without a cache there is nothing to diff against, so these dispatches only reach `raw`.
 */
export const MultiDispatchHandlers: {
  [Type in GatewayDispatchEvents]?: MultiDispatchHandler<Type>;
} = {
  [GatewayDispatchEvents.GuildEmojisUpdate]: {
    before: (client, data) => client.guilds.emojis(data.guild_id).listCached(),
    emit: async (client, data, previous: GuildEmoji[] | undefined) => {
      if (!client.cache || !previous) return [];
      const emojis = client.guilds.emojis(data.guild_id);
      const current = await Promise.all(
        data.emojis.map((emoji) => emojis.hydrate({ ...emoji, guild_id: data.guild_id })),
      );
      return diff(previous, current, "emojiCreate", "emojiUpdate", "emojiDelete");
    },
  },
  [GatewayDispatchEvents.GuildStickersUpdate]: {
    before: (client, data) => client.guilds.stickers(data.guild_id).listCached(),
    emit: async (client, data, previous: Sticker[] | undefined) => {
      if (!client.cache || !previous) return [];
      const stickers = client.guilds.stickers(data.guild_id);
      const current = await Promise.all(
        data.stickers.map((sticker) => stickers.hydrate({ ...sticker, guild_id: data.guild_id })),
      );
      return diff(previous, current, "stickerCreate", "stickerUpdate", "stickerDelete");
    },
  },
};

type Diffable = { id: string | null; equals(other: never): boolean };

// Lists the create, update, and delete events turning `previous` into `current`, matched by ID.
function diff<Value extends Diffable>(
  previous: readonly Value[],
  current: readonly Value[],
  create: string,
  update: string,
  remove: string,
): GatewayEventTuple[] {
  const before = new Map(previous.map((value) => [value.id, value]));
  const events: unknown[][] = [];
  for (const value of current) {
    const old = before.get(value.id);
    if (!old) events.push([create, value]);
    else if (!old.equals(value as never)) events.push([update, old, value]);
    before.delete(value.id);
  }

  for (const value of before.values()) events.push([remove, value]);
  return events as GatewayEventTuple[];
}

/**
 * Resolves a cache read, or `undefined` when the cache cannot be read, so an event can still be built from its
 * payload. The failure itself was already reported while applying the dispatch.
 */
type ReactionData = {
  channel_id: string;
  message_id: string;
  emoji: APIPartialEmoji;
  burst_colors?: string[];
};

// The reaction as the cache holds it after the dispatch, else one without counts.
async function reactionOf(client: GatewayClient, data: ReactionData): Promise<MessageReaction> {
  const message = await cachedOrUndefined(client.messages.get(data.channel_id, data.message_id));
  return message?.reactions.resolve(data.emoji) ?? partialReaction(data);
}

function partialReaction(data: ReactionData): MessageReaction {
  return new MessageReaction({
    channel_id: data.channel_id,
    message_id: data.message_id,
    emoji: data.emoji,
    me: false,
    me_burst: false,
    burst_colors: data.burst_colors ?? [],
  });
}

// The answer as the cache holds it after the dispatch, else one with only its ID.
async function pollAnswerOf(
  client: GatewayClient,
  data: GatewayMessagePollVoteDispatchData,
): Promise<PollAnswer> {
  const message = await cachedOrUndefined(client.messages.get(data.channel_id, data.message_id));
  return (
    message?.poll?.answers.find((answer) => answer.id === data.answer_id) ??
    new PollAnswer({
      answer_id: data.answer_id,
      poll_media: {},
      channel_id: data.channel_id,
      message_id: data.message_id,
    })
  );
}

function cachedOrUndefined<Value>(read: Promise<Value | undefined>): Promise<Value | undefined> {
  return read.catch(() => undefined);
}
