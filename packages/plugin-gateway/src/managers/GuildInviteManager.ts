import { inviteKey, type CacheEntityTypes } from "@wolfstar/plugin-cache";
import {
  type APIExtendedInvite,
  type APIInvite,
  type InviteTargetType,
  type RESTPostAPIChannelInviteJSONBody,
} from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import type { InviteData } from "../structures/BaseInvite.js";
import { GuildInvite } from "../structures/GuildInvite.js";
import { CachedManager, type AddOptions } from "./CachedManager.js";

/**
 * The options to create an invite with.
 */
export interface InviteCreateOptions {
  /**
   * How long the invite lasts, in seconds, up to 7 days. `0` never expires.
   *
   * @default 86_400
   */
  maxAge?: number;
  /**
   * How many times the invite can be used, `0` for unlimited.
   */
  maxUses?: number;
  /**
   * Whether the invite only grants temporary membership.
   */
  temporary?: boolean;
  /**
   * Whether to always create a new invite, instead of reusing a similar one.
   */
  unique?: boolean;
  targetType?: InviteTargetType;
  targetUserId?: string;
  targetApplicationId?: string;
  reason?: string;
}

/**
 * Manages the invites of one guild.
 */
export class GuildInviteManager extends CachedManager<"invites", GuildInvite, [code: string]> {
  /**
   * The ID of the guild.
   */
  public readonly guildId: string;

  public constructor(client: GatewayClient, guildId: string) {
    super(client, "invites");
    this.guildId = guildId;
  }

  public createStructure(data: CacheEntityTypes["invites"]): GuildInvite {
    return new GuildInvite(data);
  }

  public keyOf(data: CacheEntityTypes["invites"]): string {
    return this.resolveKey(data.code);
  }

  /**
   * Adds an invite to the cache, and its inviter and target user to `client.users`.
   *
   * @internal
   */
  public override async _add(
    data: CacheEntityTypes["invites"],
    cache = true,
    options?: AddOptions,
  ): Promise<GuildInvite> {
    if (data.inviter) await this.client.users._add(data.inviter, cache);
    if (data.target_user) await this.client.users._add(data.target_user, cache);
    return super._add(data, cache, options);
  }

  public override async hydrate(data: CacheEntityTypes["invites"]): Promise<GuildInvite> {
    const { users } = this.client;
    const [inviter, targetUser, guild] = await Promise.all([
      data.inviter ? users.resolveData(data.inviter) : undefined,
      data.target_user ? users.resolveData(data.target_user) : undefined,
      this.cachedGuild(this.guildId),
    ]);
    return new GuildInvite(data, { inviter, targetUser, guild });
  }

  public resolveKey(code: string): string {
    return inviteKey(this.guildId, code);
  }

  /**
   * Fetches every invite of the guild, with their metadata, and caches them.
   */
  public async fetchAll(): Promise<GuildInvite[]> {
    const invites = await this.client.core.api.guilds.getInvites(this.guildId);
    return Promise.all(invites.map((invite) => this.store(invite)));
  }

  /**
   * Fetches every invite of a channel of the guild, and caches them.
   *
   * @param channelId The ID of the channel.
   */
  public async fetchChannel(channelId: string): Promise<GuildInvite[]> {
    const invites = await this.client.core.api.channels.getInvites(channelId);
    return Promise.all(invites.map((invite) => this.store(invite)));
  }

  /**
   * Creates an invite to a channel of the guild.
   *
   * @param channelId The ID of the channel.
   * @param options The invite's limits and target.
   */
  public async create(channelId: string, options: InviteCreateOptions = {}): Promise<GuildInvite> {
    const body: RESTPostAPIChannelInviteJSONBody = {
      max_age: options.maxAge,
      max_uses: options.maxUses,
      temporary: options.temporary,
      unique: options.unique,
      target_type: options.targetType,
      target_user_id: options.targetUserId,
      target_application_id: options.targetApplicationId,
    };
    const invite = await this.client.core.api.channels.createInvite(channelId, body, {
      reason: options.reason,
    });
    return this.store(invite);
  }

  /**
   * Deletes an invite.
   *
   * @param code The code of the invite.
   * @param reason The reason for the audit log.
   */
  public async delete(code: string, reason?: string): Promise<void> {
    await this.client.core.api.invites.delete(code, { reason });
    await this.cache?.delete(this.resolveKey(code));
  }

  protected async fetchRaw(code: string) {
    const invite = await this.client.core.api.invites.get(code, { with_counts: true });
    return this.toCached(invite);
  }

  private store(invite: APIInvite | APIExtendedInvite): Promise<GuildInvite> {
    return this._add(this.toCached(invite));
  }

  // The cache holds the `INVITE_CREATE` shape: REST invites keep their nested objects, plus the flat IDs it needs.
  private toCached(invite: APIInvite | APIExtendedInvite): CacheEntityTypes["invites"] {
    const data: InviteData = {
      ...invite,
      guild_id: invite.guild?.id ?? this.guildId,
      channel_id: invite.channel?.id,
    };
    return data as CacheEntityTypes["invites"];
  }
}
