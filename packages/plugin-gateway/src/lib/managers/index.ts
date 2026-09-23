import { container } from "@wolfstar/http-framework";
import { memberKey, messageKey, roleKey, type CacheEntityTypes } from "@wolfstar/plugin-cache";
import {
  Routes,
  type APIChannel,
  type APIGuild,
  type APIGuildMember,
  type APIMessage,
  type APIRole,
  type APIThreadChannel,
  type APIUser,
} from "discord-api-types/v10";
import { Channel } from "../structures/Channel.js";
import { Guild } from "../structures/Guild.js";
import { GuildMember } from "../structures/GuildMember.js";
import { Message } from "../structures/Message.js";
import { Role } from "../structures/Role.js";
import { User } from "../structures/User.js";
import { CachedManager } from "./CachedManager.js";

/**
 * Manages the {@link User}s known to the client.
 */
export class UserManager extends CachedManager<"users", User, [userId: string]> {
  public readonly entity = "users";

  public createStructure(data: CacheEntityTypes["users"]): User {
    return new User(data);
  }

  public resolveKey(userId: string): string {
    return userId;
  }

  protected async fetchRaw(userId: string) {
    return (await container.rest.get(Routes.user(userId))) as APIUser;
  }
}

/**
 * Manages the {@link Guild}s known to the client.
 */
export class GuildManager extends CachedManager<"guilds", Guild, [guildId: string]> {
  public readonly entity = "guilds";

  public createStructure(data: CacheEntityTypes["guilds"]): Guild {
    return new Guild(data);
  }

  public resolveKey(guildId: string): string {
    return guildId;
  }

  protected async fetchRaw(guildId: string) {
    const query = new URLSearchParams({ with_counts: "true" });
    return (await container.rest.get(Routes.guild(guildId), { query })) as APIGuild;
  }
}

/**
 * Manages the {@link Channel}s known to the client, threads included.
 */
export class ChannelManager extends CachedManager<"channels", Channel, [channelId: string]> {
  public readonly entity = "channels";

  public createStructure(data: CacheEntityTypes["channels"]): Channel {
    return new Channel(data);
  }

  public resolveKey(channelId: string): string {
    return channelId;
  }

  /**
   * Gets a channel from the cache, looking it up in the thread cache as well.
   *
   * @param channelId The ID of the channel.
   */
  public override async get(channelId: string): Promise<Channel | undefined> {
    return (await super.get(channelId)) ?? this.client.threads.get(channelId);
  }

  protected async fetchRaw(channelId: string) {
    return (await container.rest.get(Routes.channel(channelId))) as APIChannel;
  }
}

/**
 * Manages the threads known to the client, represented as {@link Channel}s.
 */
export class ThreadManager extends CachedManager<"threads", Channel, [threadId: string]> {
  public readonly entity = "threads";

  public createStructure(data: CacheEntityTypes["threads"]): Channel {
    return new Channel(data);
  }

  public resolveKey(threadId: string): string {
    return threadId;
  }

  protected async fetchRaw(threadId: string) {
    return (await container.rest.get(Routes.channel(threadId))) as APIThreadChannel;
  }
}

/**
 * Manages the {@link Message}s known to the client.
 */
export class MessageManager extends CachedManager<
  "messages",
  Message,
  [channelId: string, messageId: string]
> {
  public readonly entity = "messages";

  public createStructure(data: CacheEntityTypes["messages"]): Message {
    return new Message(data);
  }

  public resolveKey(channelId: string, messageId: string): string {
    return messageKey(channelId, messageId);
  }

  protected async fetchRaw(channelId: string, messageId: string) {
    return (await container.rest.get(Routes.channelMessage(channelId, messageId))) as APIMessage;
  }
}

/**
 * Manages the {@link GuildMember}s known to the client.
 */
export class GuildMemberManager extends CachedManager<
  "members",
  GuildMember,
  [guildId: string, userId: string]
> {
  public readonly entity = "members";

  public createStructure(data: CacheEntityTypes["members"]): GuildMember {
    return new GuildMember(data);
  }

  public resolveKey(guildId: string, userId: string): string {
    return memberKey(guildId, userId);
  }

  protected async fetchRaw(guildId: string, userId: string) {
    const member = (await container.rest.get(
      Routes.guildMember(guildId, userId),
    )) as APIGuildMember;
    return { ...member, guild_id: guildId };
  }
}

/**
 * Manages the {@link Role}s known to the client.
 */
export class RoleManager extends CachedManager<"roles", Role, [guildId: string, roleId: string]> {
  public readonly entity = "roles";

  public createStructure(data: CacheEntityTypes["roles"]): Role {
    return new Role(data);
  }

  public resolveKey(guildId: string, roleId: string): string {
    return roleKey(guildId, roleId);
  }

  protected async fetchRaw(guildId: string, roleId: string) {
    const role = (await container.rest.get(Routes.guildRole(guildId, roleId))) as APIRole;
    return { ...role, guild_id: guildId };
  }
}
