import type {
  GatewayChannelPinsUpdateDispatchData,
  GatewayDispatchPayload,
  GatewayGuildDeleteDispatchData,
  GatewayGuildIntegrationsUpdateDispatchData,
  GatewayIntegrationDeleteDispatchData,
  GatewayGuildMemberRemoveDispatchData,
  GatewayGuildMembersChunkDispatchData,
  GatewayGuildRoleDeleteDispatchData,
  GatewayInviteDeleteDispatchData,
  GatewayMessageDeleteBulkDispatchData,
  GatewayMessageDeleteDispatchData,
  GatewayMessageReactionRemoveAllDispatchData,
  ReactionType,
  GatewayGuildScheduledEventUserAddDispatchData,
  GatewayGuildScheduledEventUserRemoveDispatchData,
  GatewayGuildSoundboardSoundDeleteDispatchData,
  GatewayThreadDeleteDispatchData,
  GatewayThreadListSync,
  GatewayThreadMembersUpdateDispatchData,
  GatewayVoiceServerUpdateDispatchData,
  GatewayWebhooksUpdateDispatchData,
} from "discord-api-types/v10";
import type { CacheEntityName } from "@wolfstar/plugin-cache";
import type { GatewayClient } from "../GatewayClient.js";
import type { AnyChannel } from "../managers/ChannelManager.js";
import type { AnyThreadChannel } from "../managers/ThreadManager.js";
import type { AutoModerationActionExecution } from "../structures/automoderation/AutoModerationActionExecution.js";
import type { AutoModerationRule } from "../structures/automoderation/AutoModerationRule.js";
import type { Guild } from "../structures/guilds/Guild.js";
import type { GuildAuditLogsEntry } from "../structures/guilds/GuildAuditLogsEntry.js";
import type { GuildBan } from "../structures/guilds/GuildBan.js";
import type { GuildScheduledEvent } from "../structures/guilds/GuildScheduledEvent.js";
import type { Integration } from "../structures/guilds/Integration.js";
import type { SoundboardSound } from "../structures/soundboards/SoundboardSound.js";
import type { StageInstance } from "../structures/stageInstances/StageInstance.js";
import type { GuildEmoji } from "../structures/emojis/GuildEmoji.js";
import type { GuildInvite } from "../structures/invites/GuildInvite.js";
import type { GuildMember } from "../structures/guilds/GuildMember.js";
import type { Message } from "../structures/messages/Message.js";
import type { MessageReaction } from "../structures/messages/MessageReaction.js";
import type { PollAnswer } from "../structures/polls/PollAnswer.js";
import type { Role } from "../structures/guilds/Role.js";
import type { Presence } from "../structures/presences/Presence.js";
import type { Sticker } from "../structures/stickers/Sticker.js";
import type { ThreadMember } from "../structures/channels/ThreadMember.js";
import type { Typing } from "../structures/channels/Typing.js";
import type { User } from "../structures/users/User.js";
import type { VoiceState } from "../structures/voice/VoiceState.js";

/**
 * Where a cache failure reported by the `cacheError` event happened.
 */
export interface CacheErrorContext {
  /**
   * The entity cache that failed.
   */
  entity: CacheEntityName;
  /**
   * The key of the entry, `null` for operations spanning the whole cache.
   */
  key: string | null;
  /**
   * The operation that failed.
   */
  operation: "get" | "set" | "upsert" | "delete";
}

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
 *
 * With the matching `Partials` enabled, uncached messages, users, members, thread members, scheduled events,
 * soundboard sounds, polls, and direct messages are partial structures (`partial` is `true`) instead of `null`.
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
   * Emitted once, when every shard this client manages has connected and every guild `READY` listed as initially
   * unavailable became available, or {@link GatewayClientOptions.waitGuildTimeout} elapsed, like discord.js's
   * `Client#clientReady` (`ready` before discord.js deprecated it).
   */
  clientReady: [client: GatewayClient];
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
  /**
   * Emitted when a manager's cache read or write fails, e.g. while Redis is unreachable. With the default
   * `cacheErrors: "miss"`, the manager then carries on as if the entry was not cached.
   */
  cacheError: [error: unknown, context: CacheErrorContext];

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
  /**
   * Emitted for each chunk of members Discord sends in answer to `client.members.request`, once it is cached.
   * `data` has the chunk's index and count, its nonce, and the requested IDs that are not members (`not_found`).
   */
  guildMembersChunk: [
    members: GuildMember[],
    guild: Guild | null,
    data: GatewayGuildMembersChunkDispatchData,
  ];

  guildRoleCreate: [role: Role];
  guildRoleUpdate: [oldRole: Role | null, newRole: Role];
  guildRoleDelete: [role: Role | null, data: GatewayGuildRoleDeleteDispatchData];

  userUpdate: [oldUser: User | null, newUser: User];

  /**
   * Emitted for every `GUILD_EMOJIS_UPDATE`, with every emoji the guild now has. Always emitted, cache or not: the
   * granular `emojiCreate`, `emojiUpdate`, and `emojiDelete` need the previous emojis, so the emojis cache.
   */
  guildEmojisUpdate: [guildId: string, emojis: GuildEmoji[]];
  /**
   * Emitted for each emoji a `GUILD_EMOJIS_UPDATE` adds, compared with the cache. Without an emojis cache (able to
   * enumerate its entries), the emoji events are not emitted: listen to `guildEmojisUpdate` instead.
   */
  emojiCreate: [emoji: GuildEmoji];
  emojiUpdate: [oldEmoji: GuildEmoji, newEmoji: GuildEmoji];
  emojiDelete: [emoji: GuildEmoji];

  /**
   * Emitted for every `GUILD_STICKERS_UPDATE`, with every sticker the guild now has, like `guildEmojisUpdate`.
   */
  guildStickersUpdate: [guildId: string, stickers: Sticker[]];
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
  guildScheduledEventCreate: [event: GuildScheduledEvent];
  guildScheduledEventUpdate: [oldEvent: GuildScheduledEvent | null, newEvent: GuildScheduledEvent];
  guildScheduledEventDelete: [event: GuildScheduledEvent];
  /**
   * Emitted when a user subscribes to a scheduled event, with the cached event and user when there are.
   */
  guildScheduledEventUserAdd: [
    event: GuildScheduledEvent | null,
    user: User | null,
    data: GatewayGuildScheduledEventUserAddDispatchData,
  ];
  guildScheduledEventUserRemove: [
    event: GuildScheduledEvent | null,
    user: User | null,
    data: GatewayGuildScheduledEventUserRemoveDispatchData,
  ];
  stageInstanceCreate: [stageInstance: StageInstance];
  stageInstanceUpdate: [oldStageInstance: StageInstance | null, newStageInstance: StageInstance];
  stageInstanceDelete: [stageInstance: StageInstance];
  guildSoundboardSoundCreate: [sound: SoundboardSound];
  guildSoundboardSoundUpdate: [oldSound: SoundboardSound | null, newSound: SoundboardSound];
  /**
   * Emitted when a soundboard sound is deleted, with the cached sound when there is one.
   */
  guildSoundboardSoundDelete: [
    sound: SoundboardSound | null,
    data: GatewayGuildSoundboardSoundDeleteDispatchData,
  ];
  /**
   * Emitted when several soundboard sounds of a guild change at once.
   */
  guildSoundboardSoundsUpdate: [sounds: SoundboardSound[], guildId: string];
  /**
   * Emitted with the sounds of a guild, in answer to a request for them over the gateway.
   */
  soundboardSounds: [sounds: SoundboardSound[], guildId: string];

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
   * Emitted when an integration of a guild is created, updated, or deleted.
   */
  guildIntegrationsUpdate: [guild: Guild | null, data: GatewayGuildIntegrationsUpdateDispatchData];
  integrationCreate: [integration: Integration];
  integrationUpdate: [oldIntegration: Integration | null, newIntegration: Integration];
  integrationDelete: [integration: Integration | null, data: GatewayIntegrationDeleteDispatchData];
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

/**
 * The name of every event a {@link GatewayClient} emits, mirroring the keys of {@link GatewayEventMap}, like
 * `@wolfstar/http-framework`'s own `Events`.
 *
 * @remarks
 * Each member's value is the plain event name, so they are interchangeable with the string literals accepted by
 * `GatewayClient#on`, `GatewayClient#emit`, and `Listener.Options.event`.
 *
 * @example
 * ```typescript
 * client.on(GatewayEvents.MessageCreate, (message) => console.log(message.content));
 * ```
 */
export enum GatewayEvents {
  Raw = "raw",
  ShardReady = "shardReady",
  ClientReady = "clientReady",
  ShardResume = "shardResume",
  ShardClose = "shardClose",
  ShardError = "shardError",
  CacheError = "cacheError",
  GuildCreate = "guildCreate",
  GuildUpdate = "guildUpdate",
  GuildDelete = "guildDelete",
  ChannelCreate = "channelCreate",
  ChannelUpdate = "channelUpdate",
  ChannelDelete = "channelDelete",
  ChannelPinsUpdate = "channelPinsUpdate",
  WebhooksUpdate = "webhooksUpdate",
  ThreadCreate = "threadCreate",
  ThreadUpdate = "threadUpdate",
  ThreadDelete = "threadDelete",
  ThreadListSync = "threadListSync",
  ThreadMemberUpdate = "threadMemberUpdate",
  ThreadMembersUpdate = "threadMembersUpdate",
  MessageCreate = "messageCreate",
  MessageUpdate = "messageUpdate",
  MessageDelete = "messageDelete",
  MessageDeleteBulk = "messageDeleteBulk",
  MessageReactionAdd = "messageReactionAdd",
  MessageReactionRemove = "messageReactionRemove",
  MessageReactionRemoveAll = "messageReactionRemoveAll",
  MessageReactionRemoveEmoji = "messageReactionRemoveEmoji",
  MessagePollVoteAdd = "messagePollVoteAdd",
  MessagePollVoteRemove = "messagePollVoteRemove",
  GuildMemberAdd = "guildMemberAdd",
  GuildMemberUpdate = "guildMemberUpdate",
  GuildMemberRemove = "guildMemberRemove",
  GuildMembersChunk = "guildMembersChunk",
  GuildRoleCreate = "guildRoleCreate",
  GuildRoleUpdate = "guildRoleUpdate",
  GuildRoleDelete = "guildRoleDelete",
  UserUpdate = "userUpdate",
  GuildEmojisUpdate = "guildEmojisUpdate",
  EmojiCreate = "emojiCreate",
  EmojiUpdate = "emojiUpdate",
  EmojiDelete = "emojiDelete",
  GuildStickersUpdate = "guildStickersUpdate",
  StickerCreate = "stickerCreate",
  StickerUpdate = "stickerUpdate",
  StickerDelete = "stickerDelete",
  InviteCreate = "inviteCreate",
  InviteDelete = "inviteDelete",
  TypingStart = "typingStart",
  VoiceServerUpdate = "voiceServerUpdate",
  GuildScheduledEventCreate = "guildScheduledEventCreate",
  GuildScheduledEventUpdate = "guildScheduledEventUpdate",
  GuildScheduledEventDelete = "guildScheduledEventDelete",
  GuildScheduledEventUserAdd = "guildScheduledEventUserAdd",
  GuildScheduledEventUserRemove = "guildScheduledEventUserRemove",
  StageInstanceCreate = "stageInstanceCreate",
  StageInstanceUpdate = "stageInstanceUpdate",
  StageInstanceDelete = "stageInstanceDelete",
  GuildSoundboardSoundCreate = "guildSoundboardSoundCreate",
  GuildSoundboardSoundUpdate = "guildSoundboardSoundUpdate",
  GuildSoundboardSoundDelete = "guildSoundboardSoundDelete",
  GuildSoundboardSoundsUpdate = "guildSoundboardSoundsUpdate",
  SoundboardSounds = "soundboardSounds",
  GuildBanAdd = "guildBanAdd",
  GuildBanRemove = "guildBanRemove",
  GuildAuditLogEntryCreate = "guildAuditLogEntryCreate",
  AutoModerationRuleCreate = "autoModerationRuleCreate",
  AutoModerationRuleUpdate = "autoModerationRuleUpdate",
  AutoModerationRuleDelete = "autoModerationRuleDelete",
  AutoModerationActionExecution = "autoModerationActionExecution",
  GuildIntegrationsUpdate = "guildIntegrationsUpdate",
  IntegrationCreate = "integrationCreate",
  IntegrationUpdate = "integrationUpdate",
  IntegrationDelete = "integrationDelete",
  VoiceStateUpdate = "voiceStateUpdate",
  PresenceUpdate = "presenceUpdate",
}

declare module "@wolfstar/http-framework" {
  interface ClientEvents extends GatewayEventMap {}
}
