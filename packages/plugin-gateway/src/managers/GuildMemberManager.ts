import { memberKey, type CacheEntityTypes } from "@wolfstar/plugin-cache";
import {
  type APIGuildMember,
  type RESTPatchAPICurrentGuildMemberJSONBody,
  type RESTPatchAPIGuildMemberJSONBody,
  type RESTPostAPIGuildBulkBanJSONBody,
  type RESTPutAPIGuildBanJSONBody,
  type RESTPutAPIGuildMemberJSONBody,
} from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import { GuildMember } from "../structures/GuildMember.js";
import { GuildMemberFlagsBitField, type GuildMemberFlagsResolvable } from "../util/flags.js";
import { CachedManager, type AddOptions } from "./CachedManager.js";

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

  public keyOf(data: CacheEntityTypes["members"]): string {
    if (!data.user) throw new TypeError("Cannot key a member without its user");
    return this.resolveKey(data.guild_id, data.user.id);
  }

  /**
   * Adds a member to the cache, and its user to `client.users`.
   *
   * @internal
   */
  public override async _add(
    data: CacheEntityTypes["members"],
    cache = true,
    options?: AddOptions,
  ): Promise<GuildMember> {
    if (data.user) await this.client.users._add(data.user, cache);
    return super._add(data, cache, options);
  }

  public override async hydrate(data: CacheEntityTypes["members"]): Promise<GuildMember> {
    const [user, guild] = await Promise.all([
      data.user ? this.client.users.resolveData(data.user) : undefined,
      this.cachedGuild(data.guild_id),
    ]);
    return new GuildMember(data, { user, guild });
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
    const members = await this.client.core.api.guilds.getMembers(guildId, {
      limit: options.limit ?? 1,
      after: options.after,
    });
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
    const members = await this.client.core.api.guilds.searchForMembers(guildId, {
      query: options.query,
      limit: options.limit ?? 1,
    });
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
    const member = await this.client.core.api.guilds.addMember(guildId, userId, body);
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
    const member = await this.client.core.api.guilds.editMember(guildId, userId, body, {
      reason: options.reason,
    });
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
    const member = await this.client.core.api.users.editCurrentGuildMember(
      guildId,
      body satisfies RESTPatchAPICurrentGuildMemberJSONBody,
      { reason },
    );
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
    await this.client.core.api.guilds.removeMember(guildId, userId, { reason });
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
    await this.client.core.api.guilds.banUser(guildId, userId, body, { reason: options.reason });
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
    await this.client.core.api.guilds.unbanUser(guildId, userId, { reason });
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
    const result = await this.client.core.api.guilds.bulkBanUsers(guildId, body, {
      reason: options.reason,
    });
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
      const result = await this.client.core.api.guilds.getPruneCount(guildId, {
        days,
        include_roles: options.roles?.length ? options.roles.join(",") : undefined,
      });
      return result.pruned;
    }

    const result = await this.client.core.api.guilds.beginPrune(
      guildId,
      {
        days,
        compute_prune_count: options.count ?? true,
        include_roles: options.roles ? [...options.roles] : undefined,
      },
      { reason: options.reason },
    );
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
    await this.client.core.api.guilds.addRoleToMember(guildId, userId, roleId, { reason });
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
    await this.client.core.api.guilds.removeRoleFromMember(guildId, userId, roleId, { reason });
    await this.updateCachedRoles(guildId, userId, (roles) => roles.filter((id) => id !== roleId));
  }

  protected async fetchRaw(guildId: string, userId: string) {
    const member = await this.client.core.api.guilds.getMember(guildId, userId);
    return { ...member, guild_id: guildId };
  }

  // Members without their user cannot be keyed, so they are built without being cached.
  private store(guildId: string, member: APIGuildMember): Promise<GuildMember> {
    const raw = { ...member, guild_id: guildId };
    return raw.user ? this._add(raw) : this.hydrate(raw);
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
