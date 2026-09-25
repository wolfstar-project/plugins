import type { CacheEntityTypes } from "@wolfstar/plugin-cache";
import {
  GatewayDispatchEvents,
  GatewayOpcodes,
  Routes,
  type APIGuild,
  type APIGuildPreview,
  type APIIncidentsData,
  type APIVoiceRegion,
  type RESTAPIPartialCurrentUserGuild,
  type RESTGetAPIGuildVanityUrlResult,
  type RESTPatchAPIGuildJSONBody,
  type RESTPostAPIGuildsJSONBody,
  type RESTPutAPIGuildIncidentActionsJSONBody,
} from "discord-api-types/v10";
import { applyGatewayDispatch } from "@wolfstar/plugin-cache";
import type { GatewayClient } from "../GatewayClient.js";
import { AnonymousGuild } from "../structures/AnonymousGuild.js";
import { Guild, type GuildEditOptions } from "../structures/Guild.js";
import { GuildPreview } from "../structures/GuildPreview.js";
import { container } from "../util/container.js";
import { SystemChannelFlagsBitField } from "../util/flags.js";
import { CachedManager } from "./CachedManager.js";
import { GuildChannelManager } from "./GuildChannelManager.js";
import { GuildEmojiManager } from "./GuildEmojiManager.js";
import { GuildInviteManager } from "./GuildInviteManager.js";
import { GuildStickerManager } from "./GuildStickerManager.js";

/**
 * Until when to pause invites and direct messages in a guild, at most 24 hours ahead; `null` resumes them.
 */
export interface GuildIncidentActionsOptions {
  invitesDisabledUntil?: Date | number | null;
  dmsDisabledUntil?: Date | number | null;
}

/**
 * Manages the {@link Guild}s known to the client.
 */
export class GuildManager extends CachedManager<"guilds", Guild, [guildId: string]> {
  public constructor(client: GatewayClient) {
    super(client, "guilds");
  }

  public createStructure(data: CacheEntityTypes["guilds"]): Guild {
    return new Guild(data);
  }

  public keyOf(data: CacheEntityTypes["guilds"]): string {
    return data.id;
  }

  public resolveKey(guildId: string): string {
    return guildId;
  }

  /**
   * Gets the manager of a guild's channels.
   *
   * @param guildId The ID of the guild.
   */
  public channels(guildId: string): GuildChannelManager {
    return new GuildChannelManager(this.client, guildId);
  }

  /**
   * Gets the manager of a guild's custom emojis.
   *
   * @param guildId The ID of the guild.
   */
  public emojis(guildId: string): GuildEmojiManager {
    return new GuildEmojiManager(this.client, guildId);
  }

  /**
   * Gets the manager of a guild's custom stickers.
   *
   * @param guildId The ID of the guild.
   */
  public stickers(guildId: string): GuildStickerManager {
    return new GuildStickerManager(this.client, guildId);
  }

  /**
   * Gets the manager of a guild's invites.
   *
   * @param guildId The ID of the guild.
   */
  public invites(guildId: string): GuildInviteManager {
    return new GuildInviteManager(this.client, guildId);
  }

  /**
   * Lists the guilds the bot is in, as the partial guilds the API returns, paginated by guild ID.
   *
   * @param options How many guilds to list (up to 200), around which guild ID, and whether to include counts.
   */
  public async fetchPartials(
    options: { limit?: number; before?: string; after?: string; withCounts?: boolean } = {},
  ): Promise<AnonymousGuild[]> {
    const query = new URLSearchParams();
    if (options.limit) query.set("limit", String(options.limit));
    if (options.before) query.set("before", options.before);
    if (options.after) query.set("after", options.after);
    if (options.withCounts) query.set("with_counts", "true");
    const guilds = (await container.rest.get(Routes.userGuilds(), {
      query,
    })) as RESTAPIPartialCurrentUserGuild[];
    return guilds.map((guild) => new AnonymousGuild(guild));
  }

  /**
   * Creates a guild owned by the bot, which Discord only allows to bots in fewer than 10 guilds.
   *
   * @param options The guild's name and initial setup.
   */
  public async create(options: RESTPostAPIGuildsJSONBody): Promise<Guild> {
    const guild = (await container.rest.post(Routes.guilds(), { body: options })) as APIGuild;
    return this.store(guild);
  }

  /**
   * Edits a guild.
   *
   * @param guildId The ID of the guild.
   * @param options The changes to apply.
   */
  public async edit(guildId: string, options: GuildEditOptions): Promise<Guild> {
    const body: RESTPatchAPIGuildJSONBody = {
      name: options.name,
      description: options.description,
      features: options.features,
      owner_id: options.owner,
      verification_level: options.verificationLevel,
      default_message_notifications: options.defaultMessageNotifications,
      explicit_content_filter: options.explicitContentFilter,
      afk_channel_id: options.afkChannel,
      afk_timeout: options.afkTimeout,
      icon: options.icon,
      splash: options.splash,
      discovery_splash: options.discoverySplash,
      banner: options.banner,
      system_channel_id: options.systemChannel,
      system_channel_flags:
        options.systemChannelFlags === undefined
          ? undefined
          : Number(SystemChannelFlagsBitField.resolve(options.systemChannelFlags)),
      rules_channel_id: options.rulesChannel,
      public_updates_channel_id: options.publicUpdatesChannel,
      preferred_locale: options.preferredLocale,
      premium_progress_bar_enabled: options.premiumProgressBarEnabled,
      safety_alerts_channel_id: options.safetyAlertsChannel,
    };
    const guild = (await container.rest.patch(Routes.guild(guildId), {
      body,
      reason: options.reason,
    })) as APIGuild;
    return this.store(guild);
  }

  /**
   * Makes the bot leave a guild, and drops it from the cache with everything it scopes.
   *
   * @param guildId The ID of the guild.
   */
  public async leave(guildId: string): Promise<void> {
    await container.rest.delete(Routes.userGuild(guildId));
    await this.forget(guildId);
  }

  /**
   * Deletes a guild the bot owns, and drops it from the cache with everything it scopes.
   *
   * @param guildId The ID of the guild.
   */
  public async delete(guildId: string): Promise<void> {
    await container.rest.delete(Routes.guild(guildId));
    await this.forget(guildId);
  }

  /**
   * Fetches the public preview of a guild.
   *
   * @param guildId The ID of the guild.
   */
  public async fetchPreview(guildId: string): Promise<GuildPreview> {
    return new GuildPreview(
      (await container.rest.get(Routes.guildPreview(guildId))) as APIGuildPreview,
    );
  }

  /**
   * Fetches the voice regions available to a guild.
   *
   * @param guildId The ID of the guild.
   */
  public async fetchVoiceRegions(guildId: string): Promise<APIVoiceRegion[]> {
    return (await container.rest.get(Routes.guildVoiceRegions(guildId))) as APIVoiceRegion[];
  }

  /**
   * Fetches the vanity invite code of a guild and how many times it was used.
   *
   * @param guildId The ID of the guild.
   */
  public async fetchVanityData(guildId: string): Promise<RESTGetAPIGuildVanityUrlResult> {
    return (await container.rest.get(
      Routes.guildVanityUrl(guildId),
    )) as RESTGetAPIGuildVanityUrlResult;
  }

  /**
   * Pauses invites or direct messages in a guild for up to a day.
   *
   * @param guildId The ID of the guild.
   * @param options Until when to pause each, `null` to resume.
   */
  public async setIncidentActions(
    guildId: string,
    options: GuildIncidentActionsOptions,
  ): Promise<APIIncidentsData> {
    const body: RESTPutAPIGuildIncidentActionsJSONBody = {
      invites_disabled_until: toISO(options.invitesDisabledUntil),
      dms_disabled_until: toISO(options.dmsDisabledUntil),
    };
    const incidents = (await container.rest.put(Routes.guildIncidentActions(guildId), {
      body,
    })) as APIIncidentsData;
    const cached = await this.cache?.get(guildId);
    if (cached) await this.cache!.set(guildId, { ...cached, incidents_data: incidents });
    return incidents;
  }

  protected async fetchRaw(guildId: string) {
    const query = new URLSearchParams({ with_counts: "true" });
    return (await container.rest.get(Routes.guild(guildId), { query })) as APIGuild;
  }

  private store(guild: APIGuild): Promise<Guild> {
    return this._add(guild);
  }

  // The same cascade as a `GUILD_DELETE`, so no channel, member, or role of the guild outlives it. It is queued with
  // the guild's dispatches, so it never interleaves with one still being written.
  private async forget(guildId: string): Promise<void> {
    const { cache } = this.client;
    if (!cache) return;
    await this.client.runInGuildOrder(guildId, () =>
      applyGatewayDispatch(cache, {
        op: GatewayOpcodes.Dispatch,
        s: 0,
        t: GatewayDispatchEvents.GuildDelete,
        d: { id: guildId },
      }),
    );
  }
}

function toISO(value: Date | number | null | undefined): string | null | undefined {
  return value === undefined || value === null ? value : new Date(value).toISOString();
}
