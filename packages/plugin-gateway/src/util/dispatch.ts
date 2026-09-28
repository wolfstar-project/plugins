import {
  ChannelType,
  GatewayDispatchEvents,
  type APIPartialEmoji,
  type APIUser,
  type GatewayDispatchPayload,
  type GatewayMessagePollVoteDispatchData,
} from "discord-api-types/v10";
import {
  isIterableCache,
  type Awaitable,
  type CacheEntityTypes,
  type EntityCache,
} from "@wolfstar/plugin-cache";
import type { GatewayClient } from "../GatewayClient.js";
import { AutoModerationActionExecution } from "../structures/automoderation/AutoModerationActionExecution.js";
import { ClientUser } from "../structures/users/ClientUser.js";
import { GuildAuditLogsEntry } from "../structures/guilds/GuildAuditLogsEntry.js";
import { bindClient, kPatch } from "../structures/Structure.js";
import type { GuildEmoji } from "../structures/emojis/GuildEmoji.js";
import { createChannel } from "../managers/ChannelManager.js";
import type { DMChannel } from "../structures/channels/DMChannel.js";
import { GuildMember } from "../structures/guilds/GuildMember.js";
import { GuildScheduledEvent } from "../structures/guilds/GuildScheduledEvent.js";
import { GuildInvite } from "../structures/invites/GuildInvite.js";
import type { Sticker } from "../structures/stickers/Sticker.js";
import { Message } from "../structures/messages/Message.js";
import { MessageReaction } from "../structures/messages/MessageReaction.js";
import { Poll } from "../structures/polls/Poll.js";
import { PollAnswer } from "../structures/polls/PollAnswer.js";
import { SoundboardSound } from "../structures/soundboards/SoundboardSound.js";
import { ThreadMember } from "../structures/channels/ThreadMember.js";
import { User } from "../structures/users/User.js";
import { Typing } from "../structures/channels/Typing.js";
import { resolveAuditLogTarget } from "./auditLogs.js";
import { GatewayEvents, type GatewayEventMap, type GatewayEventName } from "./events.js";
import { Partials } from "./Partials.js";

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
    event: GatewayEvents.ShardReady,
    build: (client, data, _state, shardId) => {
      const user = new ClientUser(data.user);
      client.user = user;
      return [shardId, user];
    },
  },

  [GatewayDispatchEvents.GuildCreate]: {
    event: GatewayEvents.GuildCreate,
    // The cached entry has the collections stripped, prefer it over the (much larger) payload.
    build: async (client, data) => [
      (await cachedOrUndefined(client.guilds.get(data.id))) ??
        (await client.guilds.hydrate(data as CacheEntityTypes["guilds"])),
    ],
  },
  [GatewayDispatchEvents.GuildUpdate]: {
    event: GatewayEvents.GuildUpdate,
    before: (client, data) => client.guilds.get(data.id),
    build: async (client, data, previous) => [previous ?? null, await client.guilds.hydrate(data)],
  },
  [GatewayDispatchEvents.GuildDelete]: {
    event: GatewayEvents.GuildDelete,
    before: (client, data) => client.guilds.get(data.id),
    build: (_client, data, previous) => [previous ?? null, data],
  },

  [GatewayDispatchEvents.ChannelCreate]: {
    event: GatewayEvents.ChannelCreate,
    build: async (client, data) => [await client.channels.hydrate(data)],
  },
  [GatewayDispatchEvents.ChannelUpdate]: {
    event: GatewayEvents.ChannelUpdate,
    before: (client, data) => client.channels.get(data.id),
    build: async (client, data, previous) => [
      previous ?? null,
      await client.channels.hydrate(data),
    ],
  },
  [GatewayDispatchEvents.ChannelDelete]: {
    event: GatewayEvents.ChannelDelete,
    build: async (client, data) => [await client.channels.hydrate(data)],
  },

  [GatewayDispatchEvents.ChannelPinsUpdate]: {
    event: GatewayEvents.ChannelPinsUpdate,
    build: (_client, data) => [data],
  },
  [GatewayDispatchEvents.WebhooksUpdate]: {
    event: GatewayEvents.WebhooksUpdate,
    build: (_client, data) => [data],
  },

  [GatewayDispatchEvents.ThreadCreate]: {
    event: GatewayEvents.ThreadCreate,
    build: async (client, data) => [await client.threads.hydrate(data)],
  },
  [GatewayDispatchEvents.ThreadUpdate]: {
    event: GatewayEvents.ThreadUpdate,
    before: (client, data) => client.threads.get(data.id),
    build: async (client, data, previous) => [previous ?? null, await client.threads.hydrate(data)],
  },
  [GatewayDispatchEvents.ThreadDelete]: {
    event: GatewayEvents.ThreadDelete,
    before: (client, data) => client.threads.get(data.id),
    build: (_client, data, previous) => [previous ?? null, data],
  },

  [GatewayDispatchEvents.ThreadListSync]: {
    event: GatewayEvents.ThreadListSync,
    build: async (client, data) => [
      await Promise.all(data.threads.map((thread) => client.threads.hydrate(thread as never))),
      await Promise.all(
        data.members.map((member) =>
          client.threadMembers.hydrate({ ...member, guild_id: data.guild_id }),
        ),
      ),
      data,
    ],
  },
  [GatewayDispatchEvents.ThreadMemberUpdate]: {
    event: GatewayEvents.ThreadMemberUpdate,
    before: (client, data) =>
      data.id && data.user_id
        ? client.threadMembers.get(data.id, data.user_id)
        : Promise.resolve(undefined),
    build: async (client, data, previous) => [
      previous ??
        (data.id && data.user_id
          ? partialThreadMember(client, data.id, data.user_id, data.guild_id)
          : null),
      await client.threadMembers.hydrate(data),
    ],
  },
  [GatewayDispatchEvents.ThreadMembersUpdate]: {
    event: GatewayEvents.ThreadMembersUpdate,
    before: async (client, data) => {
      const removed = await Promise.all(
        (data.removed_member_ids ?? []).map((userId) => client.threadMembers.get(data.id, userId)),
      );
      return removed.filter((member) => member !== undefined);
    },
    build: async (client, data, previous: ThreadMember[] | undefined) => [
      await Promise.all(
        (data.added_members ?? []).map((member) =>
          client.threadMembers.hydrate({ ...member, id: data.id, guild_id: data.guild_id }),
        ),
      ),
      withPartials(previous ?? [], data.removed_member_ids ?? [], (userId) =>
        partialThreadMember(client, data.id, userId, data.guild_id),
      ),
      (await cachedOrUndefined(client.threads.get(data.id))) ?? null,
      data,
    ],
  },

  [GatewayDispatchEvents.MessageCreate]: {
    event: GatewayEvents.MessageCreate,
    build: async (client, data) => [await client.messages.hydrate(data)],
  },
  [GatewayDispatchEvents.MessageUpdate]: {
    event: GatewayEvents.MessageUpdate,
    before: (client, data) => client.messages.get(data.channel_id, data.id),
    build: async (client, data, previous) => [
      previous ?? partialMessage(client, data.channel_id, data.id, data.guild_id),
      await client.messages.hydrate(data),
    ],
  },
  [GatewayDispatchEvents.MessageDelete]: {
    event: GatewayEvents.MessageDelete,
    before: (client, data) => client.messages.get(data.channel_id, data.id),
    build: (client, data, previous) => [
      previous ?? partialMessage(client, data.channel_id, data.id, data.guild_id),
      data,
    ],
  },
  [GatewayDispatchEvents.MessageDeleteBulk]: {
    event: GatewayEvents.MessageDeleteBulk,
    before: async (client, data) => {
      const messages = await Promise.all(
        data.ids.map((id) => client.messages.get(data.channel_id, id)),
      );
      return messages.filter((message) => message !== undefined);
    },
    build: (client, data, previous: Message[] | undefined) => [
      withPartials(previous ?? [], data.ids, (id) =>
        partialMessage(client, data.channel_id, id, data.guild_id),
      ),
      data,
    ],
  },

  [GatewayDispatchEvents.MessageReactionAdd]: {
    event: GatewayEvents.MessageReactionAdd,
    build: async (client, data) => [
      await reactionOf(client, data),
      (await cachedOrUndefined(client.users.get(data.user_id))) ??
        partialUser(client, data.user_id),
      { userId: data.user_id, type: data.type, burst: data.burst },
    ],
  },
  [GatewayDispatchEvents.MessageReactionRemove]: {
    event: GatewayEvents.MessageReactionRemove,
    build: async (client, data) => [
      await reactionOf(client, data),
      (await cachedOrUndefined(client.users.get(data.user_id))) ??
        partialUser(client, data.user_id),
      { userId: data.user_id, type: data.type, burst: data.burst },
    ],
  },
  [GatewayDispatchEvents.MessageReactionRemoveAll]: {
    event: GatewayEvents.MessageReactionRemoveAll,
    before: async (client, data) =>
      (await client.messages.get(data.channel_id, data.message_id))?.reactions.cache ?? [],
    build: async (client, data, previous: MessageReaction[] | undefined) => [
      (await cachedOrUndefined(client.messages.get(data.channel_id, data.message_id))) ??
        partialMessage(client, data.channel_id, data.message_id, data.guild_id),
      previous ?? [],
      data,
    ],
  },
  [GatewayDispatchEvents.MessageReactionRemoveEmoji]: {
    event: GatewayEvents.MessageReactionRemoveEmoji,
    before: async (client, data) =>
      (await client.messages.get(data.channel_id, data.message_id))?.reactions.resolve(
        data.emoji,
      ) ?? undefined,
    build: async (client, data, previous: MessageReaction | undefined) => [
      previous ?? (await partialReaction(client, data)),
    ],
  },
  [GatewayDispatchEvents.MessagePollVoteAdd]: {
    event: GatewayEvents.MessagePollVoteAdd,
    build: async (client, data) => [await pollAnswerOf(client, data), data.user_id],
  },
  [GatewayDispatchEvents.MessagePollVoteRemove]: {
    event: GatewayEvents.MessagePollVoteRemove,
    build: async (client, data) => [await pollAnswerOf(client, data), data.user_id],
  },

  [GatewayDispatchEvents.GuildMemberAdd]: {
    event: GatewayEvents.GuildMemberAdd,
    build: async (client, data) => [await client.members.hydrate(data)],
  },
  [GatewayDispatchEvents.GuildMemberUpdate]: {
    event: GatewayEvents.GuildMemberUpdate,
    before: (client, data) => client.members.get(data.guild_id, data.user.id),
    // The payload is partial: prefer the cached entry, which it was merged into.
    build: async (client, data, previous) => [
      previous ?? partialMember(client, data.guild_id, { id: data.user.id }),
      (await cachedOrUndefined(client.members.get(data.guild_id, data.user.id))) ??
        (await client.members.hydrate(data as CacheEntityTypes["members"])),
    ],
  },
  [GatewayDispatchEvents.GuildMemberRemove]: {
    event: GatewayEvents.GuildMemberRemove,
    before: (client, data) => client.members.get(data.guild_id, data.user.id),
    build: (client, data, previous) => [
      previous ?? partialMember(client, data.guild_id, data.user),
      data,
    ],
  },
  [GatewayDispatchEvents.GuildMembersChunk]: {
    event: GatewayEvents.GuildMembersChunk,
    build: async (client, data) => {
      const [members, guild] = await Promise.all([
        Promise.all(
          data.members.map((member) =>
            client.members.hydrate({ ...member, guild_id: data.guild_id }),
          ),
        ),
        cachedOrUndefined(client.guilds.get(data.guild_id)),
      ]);
      // The chunk is cached by now, so a request resolving with it is followed by reads that see it.
      client.members.handleChunk(members, data);
      return [members, guild ?? null, data];
    },
  },

  [GatewayDispatchEvents.GuildRoleCreate]: {
    event: GatewayEvents.GuildRoleCreate,
    build: async (client, data) => [
      await client.roles.hydrate({ ...data.role, guild_id: data.guild_id }),
    ],
  },
  [GatewayDispatchEvents.GuildRoleUpdate]: {
    event: GatewayEvents.GuildRoleUpdate,
    before: (client, data) => client.roles.get(data.guild_id, data.role.id),
    build: async (client, data, previous) => [
      previous ?? null,
      await client.roles.hydrate({ ...data.role, guild_id: data.guild_id }),
    ],
  },
  [GatewayDispatchEvents.GuildRoleDelete]: {
    event: GatewayEvents.GuildRoleDelete,
    before: (client, data) => client.roles.get(data.guild_id, data.role_id),
    build: (_client, data, previous) => [previous ?? null, data],
  },

  [GatewayDispatchEvents.InviteCreate]: {
    event: GatewayEvents.InviteCreate,
    build: async (client, data) => [
      data.guild_id
        ? await client.guilds.invites(data.guild_id).hydrate(data)
        : bindClient(
            new GuildInvite(data, {
              channel: (await cachedOrUndefined(client.channels.get(data.channel_id))) ?? null,
            }),
            client,
          ),
    ],
  },
  [GatewayDispatchEvents.InviteDelete]: {
    event: GatewayEvents.InviteDelete,
    before: async (client, data) =>
      data.guild_id ? client.guilds.invites(data.guild_id).get(data.code) : undefined,
    build: (_client, data, previous) => [previous ?? null, data],
  },

  [GatewayDispatchEvents.TypingStart]: {
    event: GatewayEvents.TypingStart,
    build: async (client, data) => [await typingOf(client, data)],
  },
  [GatewayDispatchEvents.VoiceStateUpdate]: {
    event: GatewayEvents.VoiceStateUpdate,
    before: async (client, data) =>
      data.guild_id ? client.voiceStates.get(data.guild_id, data.user_id) : undefined,
    build: async (client, data, previous) => [
      previous ?? null,
      await client.voiceStates.hydrate(data),
    ],
  },
  [GatewayDispatchEvents.PresenceUpdate]: {
    event: GatewayEvents.PresenceUpdate,
    before: (client, data) => client.presences.get(data.guild_id, data.user.id),
    // The payload may be partial: prefer the cached entry, which it was merged into.
    build: async (client, data, previous) => [
      previous ?? null,
      (await cachedOrUndefined(client.presences.get(data.guild_id, data.user.id))) ??
        (await client.presences.hydrate(data)),
    ],
  },
  [GatewayDispatchEvents.GuildScheduledEventCreate]: {
    event: GatewayEvents.GuildScheduledEventCreate,
    build: async (client, data) => [
      await client.guilds.scheduledEvents(data.guild_id).hydrate(data),
    ],
  },
  [GatewayDispatchEvents.GuildScheduledEventUpdate]: {
    event: GatewayEvents.GuildScheduledEventUpdate,
    before: (client, data) => client.guilds.scheduledEvents(data.guild_id).get(data.id),
    build: async (client, data, previous) => [
      previous ?? partialScheduledEvent(client, data.guild_id, data.id),
      await client.guilds.scheduledEvents(data.guild_id).hydrate(data),
    ],
  },
  [GatewayDispatchEvents.GuildScheduledEventDelete]: {
    event: GatewayEvents.GuildScheduledEventDelete,
    build: async (client, data) => [
      await client.guilds.scheduledEvents(data.guild_id).hydrate(data),
    ],
  },
  [GatewayDispatchEvents.GuildScheduledEventUserAdd]: {
    event: GatewayEvents.GuildScheduledEventUserAdd,
    build: async (client, data) => [
      (await cachedOrUndefined(
        client.guilds.scheduledEvents(data.guild_id).get(data.guild_scheduled_event_id),
      )) ?? partialScheduledEvent(client, data.guild_id, data.guild_scheduled_event_id),
      (await cachedOrUndefined(client.users.get(data.user_id))) ??
        partialUser(client, data.user_id),
      data,
    ],
  },
  [GatewayDispatchEvents.GuildScheduledEventUserRemove]: {
    event: GatewayEvents.GuildScheduledEventUserRemove,
    build: async (client, data) => [
      (await cachedOrUndefined(
        client.guilds.scheduledEvents(data.guild_id).get(data.guild_scheduled_event_id),
      )) ?? partialScheduledEvent(client, data.guild_id, data.guild_scheduled_event_id),
      (await cachedOrUndefined(client.users.get(data.user_id))) ??
        partialUser(client, data.user_id),
      data,
    ],
  },
  [GatewayDispatchEvents.StageInstanceCreate]: {
    event: GatewayEvents.StageInstanceCreate,
    build: async (client, data) => [
      await client.guilds.stageInstances(data.guild_id).hydrate(data),
    ],
  },
  [GatewayDispatchEvents.StageInstanceUpdate]: {
    event: GatewayEvents.StageInstanceUpdate,
    before: (client, data) => client.guilds.stageInstances(data.guild_id).get(data.channel_id),
    build: async (client, data, previous) => [
      previous ?? null,
      await client.guilds.stageInstances(data.guild_id).hydrate(data),
    ],
  },
  [GatewayDispatchEvents.StageInstanceDelete]: {
    event: GatewayEvents.StageInstanceDelete,
    build: async (client, data) => [
      await client.guilds.stageInstances(data.guild_id).hydrate(data),
    ],
  },
  [GatewayDispatchEvents.GuildSoundboardSoundCreate]: {
    event: GatewayEvents.GuildSoundboardSoundCreate,
    build: async (client, data) => [
      await client.guilds.soundboardSounds(data.guild_id!).hydrate(data),
    ],
  },
  [GatewayDispatchEvents.GuildSoundboardSoundUpdate]: {
    event: GatewayEvents.GuildSoundboardSoundUpdate,
    before: (client, data) => client.guilds.soundboardSounds(data.guild_id!).get(data.sound_id),
    build: async (client, data, previous) => [
      previous ?? partialSoundboardSound(client, data.guild_id!, data.sound_id),
      await client.guilds.soundboardSounds(data.guild_id!).hydrate(data),
    ],
  },
  [GatewayDispatchEvents.GuildSoundboardSoundDelete]: {
    event: GatewayEvents.GuildSoundboardSoundDelete,
    before: (client, data) => client.guilds.soundboardSounds(data.guild_id).get(data.sound_id),
    build: (client, data, previous) => [
      previous ?? partialSoundboardSound(client, data.guild_id, data.sound_id),
      data,
    ],
  },
  [GatewayDispatchEvents.GuildSoundboardSoundsUpdate]: {
    event: GatewayEvents.GuildSoundboardSoundsUpdate,
    build: async (client, data) => {
      const sounds = client.guilds.soundboardSounds(data.guild_id);
      return [
        await Promise.all(data.soundboard_sounds.map((sound) => sounds.hydrate(sound))),
        data.guild_id,
      ];
    },
  },
  [GatewayDispatchEvents.SoundboardSounds]: {
    event: GatewayEvents.SoundboardSounds,
    build: async (client, data) => {
      const sounds = client.guilds.soundboardSounds(data.guild_id);
      return [
        await Promise.all(data.soundboard_sounds.map((sound) => sounds.hydrate(sound))),
        data.guild_id,
      ];
    },
  },

  [GatewayDispatchEvents.GuildBanAdd]: {
    event: GatewayEvents.GuildBanAdd,
    build: async (client, data) => [await client.guilds.bans(data.guild_id).hydrate(data)],
  },
  [GatewayDispatchEvents.GuildBanRemove]: {
    event: GatewayEvents.GuildBanRemove,
    before: (client, data) => client.guilds.bans(data.guild_id).get(data.user.id),
    build: async (client, data, previous) => [
      previous ?? (await client.guilds.bans(data.guild_id).hydrate(data)),
    ],
  },
  [GatewayDispatchEvents.GuildAuditLogEntryCreate]: {
    event: GatewayEvents.GuildAuditLogEntryCreate,
    build: async (client, data) => {
      const [executor, guild, target] = await Promise.all([
        data.user_id ? cachedOrUndefined(client.users.get(data.user_id)) : undefined,
        cachedOrUndefined(client.guilds.get(data.guild_id)),
        resolveAuditLogTarget(client, data),
      ]);
      return [
        bindClient(
          new GuildAuditLogsEntry(data, {
            executor: executor ?? null,
            guild: guild ?? null,
            target,
          }),
          client,
        ),
      ];
    },
  },
  [GatewayDispatchEvents.AutoModerationRuleCreate]: {
    event: GatewayEvents.AutoModerationRuleCreate,
    build: async (client, data) => [
      await client.guilds.autoModerationRules(data.guild_id).hydrate(data),
    ],
  },
  [GatewayDispatchEvents.AutoModerationRuleUpdate]: {
    event: GatewayEvents.AutoModerationRuleUpdate,
    before: (client, data) => client.guilds.autoModerationRules(data.guild_id).get(data.id),
    build: async (client, data, previous) => [
      previous ?? null,
      await client.guilds.autoModerationRules(data.guild_id).hydrate(data),
    ],
  },
  [GatewayDispatchEvents.AutoModerationRuleDelete]: {
    event: GatewayEvents.AutoModerationRuleDelete,
    build: async (client, data) => [
      await client.guilds.autoModerationRules(data.guild_id).hydrate(data),
    ],
  },
  [GatewayDispatchEvents.GuildIntegrationsUpdate]: {
    event: GatewayEvents.GuildIntegrationsUpdate,
    build: async (client, data) => [
      (await cachedOrUndefined(client.guilds.get(data.guild_id))) ?? null,
      data,
    ],
  },
  [GatewayDispatchEvents.IntegrationCreate]: {
    event: GatewayEvents.IntegrationCreate,
    build: async (client, data) => [await client.guilds.integrations(data.guild_id).hydrate(data)],
  },
  [GatewayDispatchEvents.IntegrationUpdate]: {
    event: GatewayEvents.IntegrationUpdate,
    before: (client, data) => client.guilds.integrations(data.guild_id).get(data.id),
    build: async (client, data, previous) => [
      previous ?? null,
      await client.guilds.integrations(data.guild_id).hydrate(data),
    ],
  },
  [GatewayDispatchEvents.IntegrationDelete]: {
    event: GatewayEvents.IntegrationDelete,
    before: (client, data) => client.guilds.integrations(data.guild_id).get(data.id),
    build: (_client, data, previous) => [previous ?? null, data],
  },

  [GatewayDispatchEvents.AutoModerationActionExecution]: {
    event: GatewayEvents.AutoModerationActionExecution,
    build: async (client, data) => {
      const [user, guild, member, channel, autoModerationRule] = await Promise.all([
        cachedOrUndefined(client.users.get(data.user_id)),
        cachedOrUndefined(client.guilds.get(data.guild_id)),
        cachedOrUndefined(client.members.get(data.guild_id, data.user_id)),
        data.channel_id ? cachedOrUndefined(client.channels.get(data.channel_id)) : undefined,
        cachedOrUndefined(client.guilds.autoModerationRules(data.guild_id).get(data.rule_id)),
      ]);
      return [
        bindClient(
          new AutoModerationActionExecution(data, {
            user: user ?? null,
            guild: guild ?? null,
            member: member ?? null,
            channel: channel ?? null,
            autoModerationRule: autoModerationRule ?? null,
          }),
          client,
        ),
      ];
    },
  },
  [GatewayDispatchEvents.VoiceServerUpdate]: {
    event: GatewayEvents.VoiceServerUpdate,
    build: (_client, data) => [data],
  },

  [GatewayDispatchEvents.UserUpdate]: {
    event: GatewayEvents.UserUpdate,
    before: (client, data) => client.users.get(data.id),
    build: async (client, data, previous) => {
      // The bot's own updates keep `client.user` a `ClientUser`, with its presence.
      if (client.user?.id === data.id) {
        client.user[kPatch](data);
        return [previous ?? partialUser(client, data.id), client.user];
      }

      return [previous ?? partialUser(client, data.id), await client.users.hydrate(data)];
    },
  },
};

/**
 * The table of the dispatches that turn into several events, diffed against the cache.
 *
 * @remarks
 * Their aggregate event (e.g. `guildEmojisUpdate`) is always emitted. Without a cache there is nothing to diff
 * against, so the granular events are not.
 */
export const MultiDispatchHandlers: {
  [Type in GatewayDispatchEvents]?: MultiDispatchHandler<Type>;
} = {
  [GatewayDispatchEvents.GuildEmojisUpdate]: {
    before: (client, data) =>
      cachedList(client.cache?.emojis, () => client.guilds.emojis(data.guild_id).listCached()),
    emit: async (client, data, previous: GuildEmoji[] | undefined) => {
      const emojis = client.guilds.emojis(data.guild_id);
      const current = await Promise.all(
        data.emojis.map((emoji) => emojis.hydrate({ ...emoji, guild_id: data.guild_id })),
      );
      const events: GatewayEventTuple[] = [
        [GatewayEvents.GuildEmojisUpdate, data.guild_id, current],
      ];
      if (!previous) return events;
      return events.concat(
        diff(
          previous,
          current,
          GatewayEvents.EmojiCreate,
          GatewayEvents.EmojiUpdate,
          GatewayEvents.EmojiDelete,
        ),
      );
    },
  },
  [GatewayDispatchEvents.GuildStickersUpdate]: {
    before: (client, data) =>
      cachedList(client.cache?.stickers, () => client.guilds.stickers(data.guild_id).listCached()),
    emit: async (client, data, previous: Sticker[] | undefined) => {
      const stickers = client.guilds.stickers(data.guild_id);
      const current = await Promise.all(
        data.stickers.map((sticker) => stickers.hydrate({ ...sticker, guild_id: data.guild_id })),
      );
      const events: GatewayEventTuple[] = [
        [GatewayEvents.GuildStickersUpdate, data.guild_id, current],
      ];
      if (!previous) return events;
      return events.concat(
        diff(
          previous,
          current,
          GatewayEvents.StickerCreate,
          GatewayEvents.StickerUpdate,
          GatewayEvents.StickerDelete,
        ),
      );
    },
  },
};

// The cached list to diff against, `undefined` when there is none: no store, or one that cannot enumerate.
async function cachedList<Value>(
  store: EntityCache<unknown> | undefined,
  list: () => Promise<Value[]>,
): Promise<Value[] | undefined> {
  return store && isIterableCache(store) ? list() : undefined;
}

type Diffable = { id: string | null; equals(other: never): boolean };

// Lists the create, update, and delete events turning `previous` into `current`, matched by ID.
function diff<Value extends Diffable>(
  previous: readonly Value[],
  current: readonly Value[],
  create: GatewayEvents,
  update: GatewayEvents,
  remove: GatewayEvents,
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
  guild_id?: string;
  emoji: APIPartialEmoji;
  burst_colors?: string[];
};

// The reaction as the cache holds it after the dispatch. When the message is cached but the reaction is gone (its
// last user removed it), the counts are known to be zero; only an uncached message leaves them unknown.
async function reactionOf(client: GatewayClient, data: ReactionData): Promise<MessageReaction> {
  const message = await cachedOrUndefined(client.messages.get(data.channel_id, data.message_id));
  if (!message) return partialReaction(client, data);
  return message.reactions.resolve(data.emoji) ?? partialReaction(client, data, true, message);
}

// A reaction the cached message does not hold, with the message when it is cached, and the cached custom emoji of the
// message's guild.
async function partialReaction(
  client: GatewayClient,
  data: ReactionData,
  emptied = false,
  message: Message | null = partialMessage(client, data.channel_id, data.message_id, data.guild_id),
): Promise<MessageReaction> {
  const { guild_id: guildId, emoji } = data;
  const cachedEmoji =
    guildId && emoji.id
      ? await cachedOrUndefined(client.guilds.emojis(guildId).get(emoji.id))
      : undefined;
  return bindClient(
    new MessageReaction(
      {
        channel_id: data.channel_id,
        message_id: data.message_id,
        emoji,
        me: false,
        me_burst: false,
        burst_colors: data.burst_colors ?? [],
        ...(emptied && { count: 0, count_details: { normal: 0, burst: 0 } }),
      },
      { message, emoji: cachedEmoji ?? null },
    ),
    client,
  );
}

// The answer as the cache holds it after the dispatch, else one with only its ID.
async function pollAnswerOf(
  client: GatewayClient,
  data: GatewayMessagePollVoteDispatchData,
): Promise<PollAnswer> {
  const message = await cachedOrUndefined(client.messages.get(data.channel_id, data.message_id));
  return (
    message?.poll?.answers.find((answer) => answer.id === data.answer_id) ??
    bindClient(
      new PollAnswer(
        {
          answer_id: data.answer_id,
          poll_media: {},
          channel_id: data.channel_id,
          message_id: data.message_id,
        },
        { poll: message?.poll ?? partialPoll(client, data.channel_id, data.message_id) },
      ),
      client,
    )
  );
}

// The typing user, as the cache knows them and their channel.
async function typingOf(
  client: GatewayClient,
  data: DispatchData<GatewayDispatchEvents.TypingStart>,
): Promise<Typing> {
  const { guild_id: guildId, member, user_id: userId } = data;
  const [channel, user, guild, resolvedMember] = await Promise.all([
    cachedOrUndefined(client.channels.get(data.channel_id)),
    cachedOrUndefined(
      member?.user ? client.users.resolveData(member.user) : client.users.get(userId),
    ),
    guildId ? cachedOrUndefined(Promise.resolve(client.guilds._getShallow(guildId))) : undefined,
    guildId
      ? cachedOrUndefined(
          member?.user
            ? client.members.resolveData({ ...member, guild_id: guildId })
            : client.members.get(guildId, userId),
        )
      : undefined,
  ]);
  return bindClient(
    new Typing(data, {
      channel: channel ?? (guildId ? null : partialDMChannel(client, data.channel_id, userId)),
      user: user ?? partialUser(client, userId),
      guild: guild ?? null,
      member: resolvedMember ?? (guildId ? partialMember(client, guildId, { id: userId }) : null),
    }),
    client,
  );
}

// Whether the client builds partial structures of `partial`, see `GatewayClientOptions.partials`.
function wants(client: GatewayClient, partial: Partials): boolean {
  return client.partials.includes(partial);
}

// The cached entities, in the dispatch's order, completed by partial ones for the uncached IDs when `build` returns
// them (i.e. their partial is enabled): only the cached ones otherwise.
function withPartials<Value extends { id: string | null }>(
  cached: readonly Value[],
  ids: readonly string[],
  build: (id: string) => Value | null,
): Value[] {
  const byId = new Map(cached.map((value) => [value.id, value]));
  const values: Value[] = [];
  for (const id of ids) {
    const value = byId.get(id) ?? build(id);
    if (value) values.push(value);
  }

  return values;
}

// The partial structures, built from the IDs a dispatch carries when their partial is enabled, `null` otherwise. They
// are never written to the cache.

function partialMessage(
  client: GatewayClient,
  channelId: string,
  messageId: string,
  guildId?: string,
): Message | null {
  if (!wants(client, Partials.Message)) return null;
  return bindClient(
    new Message({ id: messageId, channel_id: channelId, guild_id: guildId } as never),
    client,
  );
}

function partialUser(client: GatewayClient, userId: string): User | null {
  return wants(client, Partials.User)
    ? bindClient(new User({ id: userId } as never), client)
    : null;
}

function partialMember(
  client: GatewayClient,
  guildId: string,
  user: APIUser | { id: string },
): GuildMember | null {
  if (!wants(client, Partials.GuildMember)) return null;
  return bindClient(new GuildMember({ guild_id: guildId, user } as never), client);
}

function partialThreadMember(
  client: GatewayClient,
  threadId: string,
  userId: string,
  guildId?: string,
): ThreadMember | null {
  if (!wants(client, Partials.ThreadMember)) return null;
  return bindClient(
    new ThreadMember({ id: threadId, user_id: userId, guild_id: guildId } as never),
    client,
  );
}

function partialScheduledEvent(
  client: GatewayClient,
  guildId: string,
  eventId: string,
): GuildScheduledEvent | null {
  if (!wants(client, Partials.GuildScheduledEvent)) return null;
  return bindClient(new GuildScheduledEvent({ id: eventId, guild_id: guildId } as never), client);
}

function partialSoundboardSound(
  client: GatewayClient,
  guildId: string,
  soundId: string,
): SoundboardSound | null {
  if (!wants(client, Partials.SoundboardSound)) return null;
  return bindClient(new SoundboardSound({ sound_id: soundId, guild_id: guildId } as never), client);
}

function partialPoll(client: GatewayClient, channelId: string, messageId: string): Poll | null {
  if (!wants(client, Partials.Poll)) return null;
  return bindClient(new Poll({ channel_id: channelId, message_id: messageId } as never), client);
}

// Only direct messages can be partial channels, like discord.js's: a guild channel's type is unknown from its ID.
function partialDMChannel(
  client: GatewayClient,
  channelId: string,
  recipientId: string,
): DMChannel | null {
  if (!wants(client, Partials.Channel)) return null;
  return bindClient(
    createChannel({
      id: channelId,
      type: ChannelType.DM,
      recipients: [{ id: recipientId }],
    } as never) as DMChannel,
    client,
  );
}

function cachedOrUndefined<Value>(read: Promise<Value | undefined>): Promise<Value | undefined> {
  return read.catch(() => undefined);
}
