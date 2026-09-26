import { banKey, type CacheEntityTypes } from "@wolfstar/plugin-cache";
import type { APIBan } from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import { GuildBan, type GuildBanData } from "../structures/GuildBan.js";
import { resolveId, type IdResolvable } from "../util/channels.js";
import { CachedManager, type AddOptions } from "./CachedManager.js";
import type { BanOptions } from "./GuildMemberManager.js";

/**
 * The options to list the bans of a guild with. `before` and `after` are user IDs.
 */
export interface GuildBanListOptions {
  /**
   * How many bans to fetch, up to 1000.
   */
  limit?: number;
  before?: string;
  after?: string;
}

/**
 * Manages the bans of one guild.
 *
 * @remarks
 * The gateway does not send ban reasons, so bans cached from `guildBanAdd` have none. `fetch` with `force` gets it.
 */
export class GuildBanManager extends CachedManager<"bans", GuildBan, [userId: string]> {
  public readonly guildId: string;

  public constructor(client: GatewayClient, guildId: string) {
    super(client, "bans");
    this.guildId = guildId;
  }

  public createStructure(data: CacheEntityTypes["bans"]): GuildBan {
    return new GuildBan(data);
  }

  public keyOf(data: CacheEntityTypes["bans"]): string {
    return this.resolveKey(data.user.id);
  }

  public resolveKey(userId: string): string {
    return banKey(this.guildId, userId);
  }

  /**
   * Adds a ban to the cache, and its user to `client.users`.
   *
   * @internal
   */
  public override async _add(
    data: CacheEntityTypes["bans"],
    cache = true,
    options?: AddOptions,
  ): Promise<GuildBan> {
    await this.client.users._add(data.user, cache);
    return super._add(data, cache, options);
  }

  public override async hydrate(data: CacheEntityTypes["bans"]): Promise<GuildBan> {
    const [user, guild] = await Promise.all([
      this.client.users.resolveData(data.user),
      this.cachedGuild(data.guild_id),
    ]);
    return new GuildBan(data, { user, guild });
  }

  /**
   * Lists the bans of the guild, paginated by user ID, and caches them.
   *
   * @param options How many bans, and around which user ID.
   */
  public async list(options: GuildBanListOptions = {}): Promise<GuildBan[]> {
    const bans = await this.client.core.api.guilds.getMemberBans(this.guildId, options);
    return Promise.all(bans.map((ban) => this._add(this.toData(ban))));
  }

  /**
   * Bans a user, member or not. The same as `client.members.ban`.
   *
   * @param user The user, or its ID.
   * @param options The reason, and how many seconds of the user's messages to delete.
   */
  public create(user: IdResolvable, options?: BanOptions): Promise<void> {
    return this.client.members.ban(this.guildId, resolveId(user), options);
  }

  /**
   * Lifts a ban, and drops it from the cache.
   *
   * @param user The user, or its ID.
   * @param reason The reason for the audit log.
   */
  public async remove(user: IdResolvable, reason?: string): Promise<void> {
    const userId = resolveId(user);
    await this.client.members.unban(this.guildId, userId, reason);
    await this.cache?.delete(this.resolveKey(userId));
  }

  /**
   * Bans up to 200 users at once.
   *
   * @param users The users, or their IDs.
   * @param options The reason, and how many seconds of the users' messages to delete.
   */
  public bulkCreate(
    users: readonly IdResolvable[],
    options?: BanOptions,
  ): Promise<{ bannedUsers: string[]; failedUsers: string[] }> {
    return this.client.members.bulkBan(this.guildId, users.map(resolveId), options);
  }

  protected async fetchRaw(userId: string) {
    const ban = await this.client.core.api.guilds.getMemberBan(this.guildId, userId);
    return this.toData(ban);
  }

  private toData(ban: APIBan): CacheEntityTypes["bans"] {
    const data: GuildBanData = { ...ban, guild_id: this.guildId };
    return data;
  }
}
