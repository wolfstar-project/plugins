import type {
  GatewayChannelPinsUpdateDispatchData,
  GatewayDispatchPayload,
  GatewayGuildDeleteDispatchData,
  GatewayGuildMemberRemoveDispatchData,
  GatewayGuildRoleDeleteDispatchData,
  GatewayInviteDeleteDispatchData,
  GatewayMessageDeleteBulkDispatchData,
  GatewayMessageDeleteDispatchData,
  GatewayThreadDeleteDispatchData,
  GatewayVoiceServerUpdateDispatchData,
  GatewayWebhooksUpdateDispatchData,
} from "discord-api-types/v10";
import type { AnyChannel } from "../managers/ChannelManager.js";
import type { AnyThreadChannel } from "../managers/ThreadManager.js";
import type { Guild } from "../structures/Guild.js";
import type { GuildEmoji } from "../structures/GuildEmoji.js";
import type { GuildInvite } from "../structures/GuildInvite.js";
import type { GuildMember } from "../structures/GuildMember.js";
import type { Message } from "../structures/Message.js";
import type { Role } from "../structures/Role.js";
import type { Sticker } from "../structures/Sticker.js";
import type { Typing } from "../structures/Typing.js";
import type { User } from "../structures/User.js";

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

  messageCreate: [message: Message];
  messageUpdate: [oldMessage: Message | null, newMessage: Message];
  messageDelete: [message: Message | null, data: GatewayMessageDeleteDispatchData];
  messageDeleteBulk: [messages: Message[], data: GatewayMessageDeleteBulkDispatchData];

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
}

/**
 * The name of any of the events listed in {@link GatewayEventMap}.
 */
export type GatewayEventName = keyof GatewayEventMap;

declare module "@wolfstar/http-framework" {
  interface ClientEvents extends GatewayEventMap {}
}
