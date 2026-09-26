import type { CacheEntityTypes } from "@wolfstar/plugin-cache";
import { getGatewayClient } from "../util/container.js";
import type { Guild } from "./Guild.js";
import { kData, kRelations, Structure } from "./Structure.js";
import { User } from "./User.js";

/**
 * The relations of an {@link Integration}, resolved from the cache by the guild's integration manager.
 */
export interface IntegrationRelations {
  user?: User | null;
  guild?: Guild | null;
}

/**
 * An integration of a guild: a bot, a Twitch or YouTube subscription, or a guild subscription.
 */
export class Integration extends Structure<CacheEntityTypes["integrations"]> {
  declare public [kRelations]: IntegrationRelations;

  protected override optimizeData(data: Partial<CacheEntityTypes["integrations"]>): void {
    this.optimizeTimestamp("synced_at", data.synced_at);
  }

  /**
   * @param data The raw integration.
   * @param relations The user and guild as resolved from the cache, by the guild's integration manager.
   */
  public constructor(data: CacheEntityTypes["integrations"], relations: IntegrationRelations = {}) {
    super(data, relations);
  }

  public get id() {
    return this[kData].id;
  }

  public get guildId() {
    return this[kData].guild_id;
  }

  public get name() {
    return this[kData].name;
  }

  public get type() {
    return this[kData].type;
  }

  public get enabled(): boolean | null {
    return this[kData].enabled ?? null;
  }

  /**
   * Whether the integration is syncing. Bot integrations have none.
   */
  public get syncing(): boolean | null {
    return this[kData].syncing ?? null;
  }

  /**
   * The role given to the integration's subscribers.
   */
  public get roleId(): string | null {
    return this[kData].role_id ?? null;
  }

  public get enableEmoticons(): boolean | null {
    return this[kData].enable_emoticons ?? null;
  }

  public get expireBehavior() {
    return this[kData].expire_behavior ?? null;
  }

  /**
   * The grace period, in days, before expiring subscribers.
   */
  public get expireGracePeriod(): number | null {
    return this[kData].expire_grace_period ?? null;
  }

  /**
   * The user who added the integration.
   */
  public get user(): User | null {
    const { user } = this[kData];
    return this[kRelations].user ?? (user ? new User(user) : null);
  }

  /**
   * The account on the integration's service.
   */
  public get account() {
    return this[kData].account;
  }

  public get syncedTimestamp(): number | null {
    return this.optimizedTimestamp("synced_at");
  }

  public get syncedAt(): Date | null {
    const { syncedTimestamp } = this;
    return syncedTimestamp === null ? null : new Date(syncedTimestamp);
  }

  public get subscriberCount(): number | null {
    return this[kData].subscriber_count ?? null;
  }

  public get revoked(): boolean | null {
    return this[kData].revoked ?? null;
  }

  /**
   * The application of a bot integration.
   */
  public get application() {
    return this[kData].application ?? null;
  }

  /**
   * The OAuth2 scopes the application was authorized with.
   */
  public get scopes() {
    return this[kData].scopes ?? [];
  }

  public get guild(): Guild | null {
    return this[kRelations].guild ?? null;
  }

  /**
   * Removes the integration from the guild, kicking its bot if it has one.
   *
   * @param reason The reason for the audit log.
   */
  public async delete(reason?: string): Promise<this> {
    await getGatewayClient().guilds.integrations(this.guildId).delete(this.id, reason);
    return this;
  }
}
