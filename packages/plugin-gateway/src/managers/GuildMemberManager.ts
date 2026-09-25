import { memberKey, type CacheEntityTypes } from "@wolfstar/plugin-cache";
import {
  Routes,
  type APIGuildMember,
  type RESTGetAPIGuildPruneCountResult,
  type RESTPatchAPICurrentGuildMemberJSONBody,
  type RESTPatchAPIGuildMemberJSONBody,
  type RESTPostAPIGuildBulkBanJSONBody,
  type RESTPostAPIGuildBulkBanResult,
  type RESTPostAPIGuildPruneResult,
  type RESTPutAPIGuildBanJSONBody,
  type RESTPutAPIGuildMemberJSONBody,
} from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import { GuildMember } from "../structures/GuildMember.js";
import { container } from "../util/container.js";
import { GuildMemberFlagsBitField, type GuildMemberFlagsResolvable } from "../util/flags.js";
import { CachedManager } from "./CachedManager.js";

/**
 * The options to edit a member with.
 */
export interface GuildMemberEditOptions {
  /**
   * The nickname, `null` to reset it.
   */
  nick?: string | null;
  /**
   * The IDs of the roles the member ends up with.
   */
  roles?: readonly string[];
  mute?: boolean;
  deaf?: boolean;
  /**
   * The voice channel to move the member to, `null` to disconnect them.
   */
  channel?: string | null;
  /**
   * When the timeout ends, `null` to lift it.
   */
  communicationDisabledUntil?: Date | number | null;
  flags?: GuildMemberFlagsResolvable;
  /**
   * The reason for the audit log.
   */
  reason?: string;
}

/**
 * The options to edit the bot's own member with. Images are data URIs, `null` removes them.
 */
export interface GuildMemberEditMeOptions {
  nick?: string | null;
  avatar?: string | null;
  banner?: string | null;
  bio?: string | null;
  reason?: string;
}

/**
 * The options to add a user to a guild with, through an OAuth2 access token with the `guilds.join` scope.
 */
export interface GuildMemberAddOptions {
  accessToken: string;
  nick?: string;
  roles?: readonly string[];
  mute?: boolean;
  deaf?: boolean;
}

/**
 * The options to ban users with.
 */
export interface BanOptions {
  /**
   * How many seconds of the users' messages to delete, up to 7 days.
   */
  deleteMessageSeconds?: number;
  reason?: string;
}

/**
 * The options to prune the inactive members of a guild with.
 */
export interface GuildPruneOptions {
  /**
   * How many days of inactivity make a member prunable.
   *
   * @default 7
   */
  days?: number;
  /**
   * The roles whose members are also prunable; members with roles are kept otherwise.
   */
  roles?: readonly string[];
  /**
   * Whether to only count the members that would be pruned.
   *
   * @default false
   */
  dry?: boolean;
  /**
   * Whether to return the count; turning it off is recommended for large guilds.
   *
   * @default true
   */
  count?: boolean;
  reason?: string;
}

/**
 * Manages the {@link GuildMember}s known to the client.
 */
export class GuildMemberManager extends CachedManager<
  "members",
  GuildMember,
  [guildId: string, userId: string]
> {
  public constructor(client: GatewayClient) {
    super(client, "members");
  }

  public createStructure(data: CacheEntityTypes["members"]): GuildMember {
    return new GuildMember(data);
  }

  public resolveKey(guildId: string, userId: string): string {
    return memberKey(guildId, userId);
  }

  /**
   * Fetches the bot's own member in a guild.
   *
   * @param guildId The ID of the guild.
   */
  public fetchMe(guildId: string): Promise<GuildMember> {
    return this.fetch(guildId, this.client.user?.id ?? this.client.id);
  }

  /**
   * Lists the members of a guild, in user ID order, and caches them.
   *
   * @param guildId The ID of the guild.
   * @param options How many members to list (up to 1000), and after which user ID.
   */
  public async list(
    guildId: string,
    options: { limit?: number; after?: string } = {},
  ): Promise<GuildMember[]> {
    const query = new URLSearchParams({ limit: String(options.limit ?? 1) });
    if (options.after) query.set("after", options.after);
    const members = (await container.rest.get(Routes.guildMembers(guildId), {
      query,
    })) as APIGuildMember[];
    return Promise.all(members.map((member) => this.store(guildId, member)));
  }

  /**
   * Searches the members of a guild whose username or nickname starts with a query, and caches them.
   *
   * @param guildId The ID of the guild.
   * @param options The query, and how many members to return (up to 1000).
   */
  public async search(
    guildId: string,
    options: { query: string; limit?: number },
  ): Promise<GuildMember[]> {
    const query = new URLSearchParams({
      query: options.query,
      limit: String(options.limit ?? 1),
    });
    const members = (await container.rest.get(Routes.guildMembersSearch(guildId), {
      query,
    })) as APIGuildMember[];
    return Promise.all(members.map((member) => this.store(guildId, member)));
  }

  /**
   * Adds a user to a guild, or fetches their member when they are in it already.
   *
   * @param guildId The ID of the guild.
   * @param userId The ID of the user.
   * @param options The access token and the member's initial state.
   */
  public async add(
    guildId: string,
    userId: string,
    options: GuildMemberAddOptions,
  ): Promise<GuildMember> {
    const body: RESTPutAPIGuildMemberJSONBody = {
      access_token: options.accessToken,
      nick: options.nick,
      roles: options.roles ? [...options.roles] : undefined,
      mute: options.mute,
      deaf: options.deaf,
    };
    // The API answers 204 without a body when the user already is a member.
    const member = (await container.rest.put(Routes.guildMember(guildId, userId), {
      body,
    })) as APIGuildMember | undefined;
    return member ? this.store(guildId, member) : this.fetch(guildId, userId);
  }

  /**
   * Edits a member.
   *
   * @param guildId The ID of the guild.
   * @param userId The ID of the member's user.
   * @param options The fields to edit.
   */
  public async edit(
    guildId: string,
    userId: string,
    options: GuildMemberEditOptions,
  ): Promise<GuildMember> {
    const until = options.communicationDisabledUntil;
    const body: RESTPatchAPIGuildMemberJSONBody = {
      nick: options.nick,
      roles: options.roles ? [...options.roles] : undefined,
      mute: options.mute,
      deaf: options.deaf,
      channel_id: options.channel,
      communication_disabled_until:
        until === undefined || until === null ? until : new Date(until).toISOString(),
      flags:
        options.flags === undefined
          ? undefined
          : Number(GuildMemberFlagsBitField.resolve(options.flags)),
    };
    const member = (await container.rest.patch(Routes.guildMember(guildId, userId), {
      body,
      reason: options.reason,
    })) as APIGuildMember;
    return this.store(guildId, member);
  }

  /**
   * Edits the bot's own member.
   *
   * @param guildId The ID of the guild.
   * @param options The fields to edit.
   */
  public async editMe(guildId: string, options: GuildMemberEditMeOptions): Promise<GuildMember> {
    const { reason, ...body } = options;
    const member = (await container.rest.patch(Routes.guildMember(guildId, "@me"), {
      body: body satisfies RESTPatchAPICurrentGuildMemberJSONBody,
      reason,
    })) as APIGuildMember;
    return this.store(guildId, member);
  }

  /**
   * Kicks a member.
   *
   * @param guildId The ID of the guild.
   * @param userId The ID of the member's user.
   * @param reason The reason for the audit log.
   */
  public async kick(guildId: string, userId: string, reason?: string): Promise<void> {
    await container.rest.delete(Routes.guildMember(guildId, userId), { reason });
    await this.cache?.delete(this.resolveKey(guildId, userId));
  }

  /**
   * Bans a user, member or not.
   *
   * @param guildId The ID of the guild.
   * @param userId The ID of the user.
   * @param options How many seconds of messages to delete, and the reason for the audit log.
   */
  public async ban(guildId: string, userId: string, options: BanOptions = {}): Promise<void> {
    const body: RESTPutAPIGuildBanJSONBody = {
      delete_message_seconds: options.deleteMessageSeconds,
    };
    await container.rest.put(Routes.guildBan(guildId, userId), { body, reason: options.reason });
    await this.cache?.delete(this.resolveKey(guildId, userId));
  }

  /**
   * Lifts a user's ban.
   *
   * @param guildId The ID of the guild.
   * @param userId The ID of the user.
   * @param reason The reason for the audit log.
   */
  public async unban(guildId: string, userId: string, reason?: string): Promise<void> {
    await container.rest.delete(Routes.guildBan(guildId, userId), { reason });
  }

  /**
   * Bans up to 200 users at once.
   *
   * @param guildId The ID of the guild.
   * @param userIds The IDs of the users.
   * @param options How many seconds of messages to delete, and the reason for the audit log.
   * @returns The users that were banned, and the ones that could not be.
   */
  public async bulkBan(
    guildId: string,
    userIds: readonly string[],
    options: BanOptions = {},
  ): Promise<{ bannedUsers: string[]; failedUsers: string[] }> {
    const body: RESTPostAPIGuildBulkBanJSONBody = {
      user_ids: [...userIds],
      delete_message_seconds: options.deleteMessageSeconds,
    };
    const result = (await container.rest.post(Routes.guildBulkBan(guildId), {
      body,
      reason: options.reason,
    })) as RESTPostAPIGuildBulkBanResult;
    await Promise.all(
      result.banned_users.map((userId) => this.cache?.delete(this.resolveKey(guildId, userId))),
    );
    return { bannedUsers: result.banned_users, failedUsers: result.failed_users };
  }

  /**
   * Prunes the inactive members of a guild, or counts them with `dry`.
   *
   * @param guildId The ID of the guild.
   * @param options The inactivity threshold and the roles to include.
   * @returns How many members were (or would be) pruned, `null` when `count` is `false`.
   */
  public async prune(guildId: string, options: GuildPruneOptions = {}): Promise<number | null> {
    const days = options.days ?? 7;
    if (options.dry) {
      const query = new URLSearchParams({ days: String(days) });
      if (options.roles?.length) query.set("include_roles", options.roles.join(","));
      const result = (await container.rest.get(Routes.guildPrune(guildId), {
        query,
      })) as RESTGetAPIGuildPruneCountResult;
      return result.pruned;
    }

    const result = (await container.rest.post(Routes.guildPrune(guildId), {
      body: {
        days,
        compute_prune_count: options.count ?? true,
        include_roles: options.roles ? [...options.roles] : undefined,
      },
      reason: options.reason,
    })) as RESTPostAPIGuildPruneResult;
    return result.pruned;
  }

  /**
   * Adds a role to a member.
   *
   * @param guildId The ID of the guild.
   * @param userId The ID of the member's user.
   * @param roleId The ID of the role.
   * @param reason The reason for the audit log.
   */
  public async addRole(
    guildId: string,
    userId: string,
    roleId: string,
    reason?: string,
  ): Promise<void> {
    await container.rest.put(Routes.guildMemberRole(guildId, userId, roleId), { reason });
    await this.updateCachedRoles(guildId, userId, (roles) => [...new Set([...roles, roleId])]);
  }

  /**
   * Removes a role from a member.
   *
   * @param guildId The ID of the guild.
   * @param userId The ID of the member's user.
   * @param roleId The ID of the role.
   * @param reason The reason for the audit log.
   */
  public async removeRole(
    guildId: string,
    userId: string,
    roleId: string,
    reason?: string,
  ): Promise<void> {
    await container.rest.delete(Routes.guildMemberRole(guildId, userId, roleId), { reason });
    await this.updateCachedRoles(guildId, userId, (roles) => roles.filter((id) => id !== roleId));
  }

  protected async fetchRaw(guildId: string, userId: string) {
    const member = (await container.rest.get(
      Routes.guildMember(guildId, userId),
    )) as APIGuildMember;
    return { ...member, guild_id: guildId };
  }

  private async store(guildId: string, member: APIGuildMember): Promise<GuildMember> {
    const raw = { ...member, guild_id: guildId };
    if (member.user) {
      await this.cache?.set(this.resolveKey(guildId, member.user.id), raw);
      await this.client.cache?.users.set(member.user.id, member.user);
    }

    return this.createStructure(raw);
  }

  // The role endpoints answer 204 without the member, so the cached entry is patched instead of refetched.
  private async updateCachedRoles(
    guildId: string,
    userId: string,
    update: (roles: readonly string[]) => string[],
  ): Promise<void> {
    const key = this.resolveKey(guildId, userId);
    const cached = await this.cache?.get(key);
    if (cached) await this.cache!.set(key, { ...cached, roles: update(cached.roles) });
  }
}
