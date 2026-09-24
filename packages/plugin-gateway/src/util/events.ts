import type {
  GatewayDispatchPayload,
  GatewayGuildDeleteDispatchData,
  GatewayGuildMemberRemoveDispatchData,
  GatewayGuildRoleDeleteDispatchData,
  GatewayMessageDeleteBulkDispatchData,
  GatewayMessageDeleteDispatchData,
  GatewayThreadDeleteDispatchData,
} from "discord-api-types/v10";
import type { AnyChannel } from "../managers/ChannelManager.js";
import type { AnyThreadChannel } from "../managers/ThreadManager.js";
import type { Guild } from "../structures/Guild.js";
import type { GuildMember } from "../structures/GuildMember.js";
import type { Message } from "../structures/Message.js";
import type { Role } from "../structures/Role.js";
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
}

/**
 * The name of any of the events listed in {@link GatewayEventMap}.
 */
export type GatewayEventName = keyof GatewayEventMap;

declare module "@wolfstar/http-framework" {
  interface ClientEvents extends GatewayEventMap {}
}
