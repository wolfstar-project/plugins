import type {
  GatewayChannelPinsUpdateDispatchData,
  GatewayDispatchPayload,
  GatewayGuildDeleteDispatchData,
  GatewayGuildMemberRemoveDispatchData,
  GatewayGuildRoleDeleteDispatchData,
  GatewayInviteDeleteDispatchData,
  GatewayMessageDeleteBulkDispatchData,
  GatewayMessageDeleteDispatchData,
  GatewayMessageReactionRemoveAllDispatchData,
  ReactionType,
  GatewayThreadDeleteDispatchData,
  GatewayThreadListSync,
  GatewayThreadMembersUpdateDispatchData,
  GatewayVoiceServerUpdateDispatchData,
  GatewayWebhooksUpdateDispatchData,
} from "discord-api-types/v10";
import type { AnyChannel } from "../managers/ChannelManager.js";
import type { AnyThreadChannel } from "../managers/ThreadManager.js";
import type { AutoModerationActionExecution } from "../structures/AutoModerationActionExecution.js";
import type { AutoModerationRule } from "../structures/AutoModerationRule.js";
import type { Guild } from "../structures/Guild.js";
import type { GuildAuditLogsEntry } from "../structures/GuildAuditLogsEntry.js";
import type { GuildBan } from "../structures/GuildBan.js";
import type { GuildEmoji } from "../structures/GuildEmoji.js";
import type { GuildInvite } from "../structures/GuildInvite.js";
import type { GuildMember } from "../structures/GuildMember.js";
import type { Message } from "../structures/Message.js";
import type { MessageReaction } from "../structures/MessageReaction.js";
import type { PollAnswer } from "../structures/PollAnswer.js";
import type { Role } from "../structures/Role.js";
import type { Presence } from "../structures/Presence.js";
import type { Sticker } from "../structures/Sticker.js";
import type { ThreadMember } from "../structures/ThreadMember.js";
import type { Typing } from "../structures/Typing.js";
import type { User } from "../structures/User.js";
import type { VoiceState } from "../structures/VoiceState.js";

/**
 * What a reaction event says besides the reaction and the user.
 */
export interface MessageReactionEventDetails {
  /**
   * The ID of the user who reacted, known even when the user is not.
   */
  userId: string;
  type: ReactionType;
  /**
   * Whether the reaction is a super reaction.
   */
  burst: boolean;
}

/**
 * The events a {@link GatewayClient} emits on top of the base `Client`'s ones, and their arguments.
 *
 * @remarks
 * Update events receive the previous state of the entity as read from the cache before the dispatch was applied, or
 * `null` when it was not cached. Delete events receive the cached entity (or `null`) alongside the raw dispatch data,
 * which always identifies the deleted entity.
 */
export interface GatewayEventMap {
  /**
   * Emitted for every gateway dispatch, before any processing, with the raw payload.
   */
  raw: [payload: GatewayDispatchPayload, shardId: number];
  /**
   * Emitted when a shard receives `READY`.
   */
  shardReady: [shardId: number, user: User];
  /**
   * Emitted when a shard resumes its session.
   */
  shardResume: [shardId: number];
  /**
   * Emitted when a shard's connection closes, it reconnects on its own unless the close code is fatal.
   */
  shardClose: [shardId: number, code: number];
  /**
   * Emitted when a shard runs into an error.
   */
  shardError: [error: Error, shardId: number];

  guildCreate: [guild: Guild];
  guildUpdate: [oldGuild: Guild | null, newGuild: Guild];
  /**
   * Emitted when the client leaves a guild, or when it becomes unavailable because of an outage, in which case
   * `data.unavailable` is `true`.
   */
  guildDelete: [guild: Guild | null, data: GatewayGuildDeleteDispatchData];

  channelCreate: [channel: AnyChannel];
  channelUpdate: [oldChannel: AnyChannel | null, newChannel: AnyChannel];
  channelDelete: [channel: AnyChannel];
  /**
   * Emitted when a message is pinned or unpinned; `data.last_pin_timestamp` is the time of the last pin left.
   */
  channelPinsUpdate: [data: GatewayChannelPinsUpdateDispatchData];
  /**
   * Emitted when a webhook of a channel is created, updated, or deleted.
   */
  webhooksUpdate: [data: GatewayWebhooksUpdateDispatchData];

  threadCreate: [thread: AnyThreadChannel];
  threadUpdate: [oldThread: AnyThreadChannel | null, newThread: AnyThreadChannel];
  threadDelete: [thread: AnyThreadChannel | null, data: GatewayThreadDeleteDispatchData];
  /**
   * Emitted when the bot gains access to a channel's threads, with the active ones and the bot's membership of each.
   */
  threadListSync: [
    threads: AnyThreadChannel[],
    members: ThreadMember[],
    data: GatewayThreadListSync,
  ];
  /**
   * Emitted when the bot's own thread member changes, e.g. its notification settings.
   */
  threadMemberUpdate: [oldMember: ThreadMember | null, newMember: ThreadMember];
  /**
   * Emitted when members are added to or removed from a thread. The removed members are the ones the cache held.
   */
  threadMembersUpdate: [
    added: ThreadMember[],
    removed: ThreadMember[],
    thread: AnyThreadChannel | null,
    data: GatewayThreadMembersUpdateDispatchData,
  ];

  messageCreate: [message: Message];
  messageUpdate: [oldMessage: Message | null, newMessage: Message];
  messageDelete: [message: Message | null, data: GatewayMessageDeleteDispatchData];
  messageDeleteBulk: [messages: Message[], data: GatewayMessageDeleteBulkDispatchData];

  /**
   * Emitted when a user reacts to a message. The reaction has its counts when the message is cached (`count` is
   * `null` otherwise), and the user is `null` when neither the payload (outside of guilds) nor the cache has it.
   */
  messageReactionAdd: [
    reaction: MessageReaction,
    user: User | null,
    details: MessageReactionEventDetails,
  ];
  /**
   * Emitted when a user removes their reaction. Like `messageReactionAdd`, `count` is `null` only when the message is
   * not cached: removing the last reaction of an emoji from a cached message gives a count of `0`.
   */
  messageReactionRemove: [
    reaction: MessageReaction,
    user: User | null,
    details: MessageReactionEventDetails,
  ];
  /**
   * Emitted when every reaction is removed from a message, with the reactions the cache held.
   */
  messageReactionRemoveAll: [
    message: Message | null,
    reactions: MessageReaction[],
    data: GatewayMessageReactionRemoveAllDispatchData,
  ];
  /**
   * Emitted when every reaction with one emoji is removed from a message.
   */
  messageReactionRemoveEmoji: [reaction: MessageReaction];
  /**
   * Emitted when a user votes for a poll answer. The answer has its text and counts when the message is cached.
   */
  messagePollVoteAdd: [answer: PollAnswer, userId: string];
  messagePollVoteRemove: [answer: PollAnswer, userId: string];

  guildMemberAdd: [member: GuildMember];
  guildMemberUpdate: [oldMember: GuildMember | null, newMember: GuildMember];
  guildMemberRemove: [member: GuildMember | null, data: GatewayGuildMemberRemoveDispatchData];

  guildRoleCreate: [role: Role];
  guildRoleUpdate: [oldRole: Role | null, newRole: Role];
  guildRoleDelete: [role: Role | null, data: GatewayGuildRoleDeleteDispatchData];

  userUpdate: [oldUser: User | null, newUser: User];

  /**
   * Emitted for each emoji a `GUILD_EMOJIS_UPDATE` adds, compared with the cache. Without a cache, the emoji events
   * are not emitted: listen to `raw` instead.
   */
  emojiCreate: [emoji: GuildEmoji];
  emojiUpdate: [oldEmoji: GuildEmoji, newEmoji: GuildEmoji];
  emojiDelete: [emoji: GuildEmoji];

  /**
   * Emitted for each sticker a `GUILD_STICKERS_UPDATE` adds, compared with the cache, like the emoji events.
   */
  stickerCreate: [sticker: Sticker];
  stickerUpdate: [oldSticker: Sticker, newSticker: Sticker];
  stickerDelete: [sticker: Sticker];

  inviteCreate: [invite: GuildInvite];
  /**
   * Emitted when an invite is deleted or expires, with the cached invite if any.
   */
  inviteDelete: [invite: GuildInvite | null, data: GatewayInviteDeleteDispatchData];

  typingStart: [typing: Typing];
  /**
   * Emitted when a guild's voice server changes, e.g. to hand a voice connection a new endpoint.
   */
  voiceServerUpdate: [data: GatewayVoiceServerUpdateDispatchData];

  /**
   * Emitted when a user is banned. Bans from the gateway have no reason.
   */
  guildBanAdd: [ban: GuildBan];
  /**
   * Emitted when a ban is lifted, with the cached ban (and its reason, if it was fetched) when there is one.
   */
  guildBanRemove: [ban: GuildBan];
  /**
   * Emitted when an entry is added to a guild's audit log. Needs the `GuildModeration` intent.
   */
  guildAuditLogEntryCreate: [entry: GuildAuditLogsEntry];
  autoModerationRuleCreate: [rule: AutoModerationRule];
  autoModerationRuleUpdate: [oldRule: AutoModerationRule | null, newRule: AutoModerationRule];
  autoModerationRuleDelete: [rule: AutoModerationRule];
  /**
   * Emitted when auto moderation takes an action. Needs the `AutoModerationExecution` intent.
   */
  autoModerationActionExecution: [execution: AutoModerationActionExecution];
  /**
   * Emitted when a member joins, leaves, or moves between voice channels, or changes their voice settings.
   */
  voiceStateUpdate: [oldState: VoiceState | null, newState: VoiceState];
  /**
   * Emitted when a member's status or activities change. Needs the `GuildPresences` intent.
   */
  presenceUpdate: [oldPresence: Presence | null, newPresence: Presence];
}

/**
 * The name of any of the events listed in {@link GatewayEventMap}.
 */
export type GatewayEventName = keyof GatewayEventMap;

declare module "@wolfstar/http-framework" {
  interface ClientEvents extends GatewayEventMap {}
}
