import type { BaseImageURLOptions } from "@discordjs/rest";
import type { CacheEntityTypes } from "@wolfstar/plugin-cache";
import {
  GuildFeature,
  GuildPremiumTier,
  type APIGuild,
  type APIIncidentsData,
  type APIVoiceRegion,
  type GuildDefaultMessageNotifications,
  type GuildExplicitContentFilter,
  type GuildVerificationLevel,
  type Locale,
  type RESTGetAPIGuildVanityUrlResult,
  type RESTPatchAPIGuildJSONBody,
} from "discord-api-types/v10";
import type { GuildChannelManager } from "../managers/GuildChannelManager.js";
import type { FetchedThreads } from "../managers/ThreadManager.js";
import type { GuildEmojiManager } from "../managers/GuildEmojiManager.js";
import type { GuildIncidentActionsOptions } from "../managers/GuildManager.js";
import type { GuildInviteManager } from "../managers/GuildInviteManager.js";
import type { GuildStickerManager } from "../managers/GuildStickerManager.js";
import { cdn } from "../util/cdn.js";
import { getGatewayClient } from "../util/container.js";
import type { Webhook } from "./Webhook.js";
import { SystemChannelFlagsBitField, type SystemChannelFlagsResolvable } from "../util/flags.js";
import { AnonymousGuild } from "./AnonymousGuild.js";
import type { GuildInvite } from "./GuildInvite.js";
import type { GuildMember } from "./GuildMember.js";
import type { GuildPreview } from "./GuildPreview.js";
import { kData, kPatch } from "./Structure.js";

/**
 * The options to edit a guild with. Images are data URIs (`data:image/png;base64,...`), channels are IDs.
 */
export interface GuildEditOptions {
  afkChannel?: string | null;
  afkTimeout?: RESTPatchAPIGuildJSONBody["afk_timeout"];
  banner?: string | null;
  defaultMessageNotifications?: GuildDefaultMessageNotifications | null;
  description?: string | null;
  discoverySplash?: string | null;
  explicitContentFilter?: GuildExplicitContentFilter | null;
  features?: APIGuild["features"];
  icon?: string | null;
  name?: string;
  /**
   * The ID of the member to transfer the ownership to.
   */
  owner?: string;
  preferredLocale?: Locale | null;
  premiumProgressBarEnabled?: boolean;
  publicUpdatesChannel?: string | null;
  reason?: string;
  rulesChannel?: string | null;
  safetyAlertsChannel?: string | null;
  splash?: string | null;
  systemChannel?: string | null;
  systemChannelFlags?: SystemChannelFlagsResolvable;
  verificationLevel?: GuildVerificationLevel | null;
}

/**
 * A Discord guild.
 *
 * @remarks
 * The collections sent in `GUILD_CREATE` (channels, members, roles, ...) are not kept on the guild: they are stored in
 * their own entity caches and exposed by the client's managers, e.g. `client.members.fetch(guild.id, userId)`. The
 * guild-scoped ones discord.js exposes on the guild itself (`emojis`, `stickers`, `invites`) are here too.
 */
export class Guild extends AnonymousGuild<CacheEntityTypes["guilds"]> {
  public get ownerId() {
    return this[kData].owner_id;
  }

  public get discoverySplash() {
    return this[kData].discovery_splash;
  }

  public get afkChannelId() {
    return this[kData].afk_channel_id;
  }

  /**
   * The time, in seconds, before a member is moved to the AFK channel.
   */
  public get afkTimeout() {
    return this[kData].afk_timeout;
  }

  public get widgetEnabled(): boolean {
    return this[kData].widget_enabled ?? false;
  }

  public get widgetChannelId(): string | null {
    return this[kData].widget_channel_id ?? null;
  }

  public override get verificationLevel(): GuildVerificationLevel {
    return this[kData].verification_level;
  }

  public get defaultMessageNotifications() {
    return this[kData].default_message_notifications;
  }

  public get explicitContentFilter() {
    return this[kData].explicit_content_filter;
  }

  public get mfaLevel() {
    return this[kData].mfa_level;
  }

  /**
   * The ID of the application that created the guild, for bot-created guilds.
   */
  public get applicationId() {
    return this[kData].application_id;
  }

  public get systemChannelId() {
    return this[kData].system_channel_id;
  }

  /**
   * The flags deciding which system messages are suppressed in the system channel.
   */
  public get systemChannelFlags(): Readonly<SystemChannelFlagsBitField> {
    return new SystemChannelFlagsBitField(this[kData].system_channel_flags ?? 0).freeze();
  }

  public get rulesChannelId() {
    return this[kData].rules_channel_id;
  }

  public get publicUpdatesChannelId() {
    return this[kData].public_updates_channel_id;
  }

  public get safetyAlertsChannelId() {
    return this[kData].safety_alerts_channel_id;
  }

  /**
   * The maximum number of presences of the guild, `null` for the default limit.
   */
  public get maximumPresences(): number | null {
    return this[kData].max_presences ?? null;
  }

  public get maximumMembers(): number | null {
    return this[kData].max_members ?? null;
  }

  /**
   * The maximum number of users in a video channel.
   */
  public get maxVideoChannelUsers(): number | null {
    return this[kData].max_video_channel_users ?? null;
  }

  /**
   * The maximum number of users in a stage video channel.
   */
  public get maxStageVideoChannelUsers(): number | null {
    return this[kData].max_stage_video_channel_users ?? null;
  }

  public override get nsfwLevel() {
    return this[kData].nsfw_level;
  }

  public get premiumTier() {
    return this[kData].premium_tier;
  }

  public get premiumProgressBarEnabled(): boolean {
    return this[kData].premium_progress_bar_enabled ?? false;
  }

  public get preferredLocale() {
    return this[kData].preferred_locale;
  }

  /**
   * Until when invites or direct messages are paused because of raid activity, as set with `setIncidentActions`.
   */
  public get incidentsData(): APIIncidentsData | null {
    return this[kData].incidents_data ?? null;
  }

  /**
   * Whether the guild is considered large by the gateway, `false` if unknown.
   */
  public get large(): boolean {
    return this[kData].large ?? false;
  }

  /**
   * The member count, as sent in `GUILD_CREATE` or by the API, or `null` if unknown.
   */
  public get memberCount(): number | null {
    return this[kData].member_count ?? this[kData].approximate_member_count ?? null;
  }

  /**
   * The approximate member count, only present when fetched with counts.
   */
  public get approximateMemberCount(): number | null {
    return this[kData].approximate_member_count ?? null;
  }

  /**
   * The approximate number of online members, only present when fetched with counts.
   */
  public get approximatePresenceCount(): number | null {
    return this[kData].approximate_presence_count ?? null;
  }

  /**
   * The timestamp the client user joined the guild at, as sent in `GUILD_CREATE`, or `null` if unknown.
   */
  public get joinedTimestamp(): number | null {
    const { joined_at: joinedAt } = this[kData];
    return joinedAt ? Date.parse(joinedAt) : null;
  }

  public get joinedAt(): Date | null {
    const { joinedTimestamp } = this;
    return joinedTimestamp === null ? null : new Date(joinedTimestamp);
  }

  /**
   * Whether the guild is available, `false` during a Discord outage.
   */
  public get available(): boolean {
    return !this[kData].unavailable;
  }

  /**
   * The maximum bitrate, in bits per second, voice channels of the guild can use.
   */
  public get maximumBitrate(): number {
    if (this.features.includes(GuildFeature.VIPRegions)) return 384_000;
    return this.maximumStageBitrate;
  }

  /**
   * The maximum bitrate, in bits per second, stage channels of the guild can use.
   */
  public get maximumStageBitrate(): number {
    switch (this.premiumTier) {
      case GuildPremiumTier.Tier1:
        return 128_000;
      case GuildPremiumTier.Tier2:
        return 256_000;
      case GuildPremiumTier.Tier3:
        return 384_000;
      default:
        return 96_000;
    }
  }

  /**
   * The custom emojis of the guild.
   */
  public get emojis(): GuildEmojiManager {
    return getGatewayClient().guilds.emojis(this.id);
  }

  /**
   * The custom stickers of the guild.
   */
  public get stickers(): GuildStickerManager {
    return getGatewayClient().guilds.stickers(this.id);
  }

  /**
   * Fetches the active threads of the guild, and caches them.
   */
  public fetchActiveThreads(): Promise<FetchedThreads> {
    return getGatewayClient().threads.fetchActive(this.id);
  }

  /**
   * Fetches the webhooks of the guild.
   */
  public fetchWebhooks(): Promise<Webhook[]> {
    return getGatewayClient().webhooks.fetchGuild(this.id);
  }

  /**
   * The channels of the guild.
   */
  public get channels(): GuildChannelManager {
    return getGatewayClient().guilds.channels(this.id);
  }

  /**
   * The invites of the guild.
   */
  public get invites(): GuildInviteManager {
    return getGatewayClient().guilds.invites(this.id);
  }

  /**
   * Gets the URL of the guild's discovery splash image, or `null` if it has none.
   * @param options The image options.
   */
  public discoverySplashURL(options?: BaseImageURLOptions): string | null {
    const { discovery_splash: discoverySplash } = this[kData];
    return discoverySplash ? cdn.discoverySplash(this.id, discoverySplash, options) : null;
  }

  /**
   * Fetches this guild from the API, with its approximate counts, and patches it in place.
   */
  public async fetch(): Promise<this> {
    const guild = await getGatewayClient().guilds.fetch(this.id, { force: true });
    return this[kPatch](guild.toJSON());
  }

  /**
   * Fetches the member owning this guild.
   */
  public fetchOwner(): Promise<GuildMember> {
    return getGatewayClient().members.fetch(this.id, this.ownerId);
  }

  /**
   * Fetches every invite of this guild.
   */
  public fetchInvites(): Promise<GuildInvite[]> {
    return this.invites.fetchAll();
  }

  /**
   * Fetches the public preview of this guild.
   */
  public fetchPreview(): Promise<GuildPreview> {
    return getGatewayClient().guilds.fetchPreview(this.id);
  }

  /**
   * Fetches the voice regions available to this guild.
   */
  public fetchVoiceRegions(): Promise<APIVoiceRegion[]> {
    return getGatewayClient().guilds.fetchVoiceRegions(this.id);
  }

  /**
   * Fetches the vanity URL of this guild, patching {@link AnonymousGuild.vanityURLCode} in place.
   */
  public async fetchVanityData(): Promise<RESTGetAPIGuildVanityUrlResult> {
    const data = await getGatewayClient().guilds.fetchVanityData(this.id);
    this[kPatch]({ vanity_url_code: data.code });
    return data;
  }

  /**
   * Edits this guild.
   *
   * @param options The changes to apply.
   */
  public async edit(options: GuildEditOptions): Promise<this> {
    const guild = await getGatewayClient().guilds.edit(this.id, options);
    return this[kPatch](guild.toJSON());
  }

  public setName(name: string, reason?: string): Promise<this> {
    return this.edit({ name, reason });
  }

  /**
   * Sets the icon of this guild, as a data URI, `null` to remove it.
   */
  public setIcon(icon: string | null, reason?: string): Promise<this> {
    return this.edit({ icon, reason });
  }

  /**
   * Sets the banner of this guild, as a data URI, `null` to remove it.
   */
  public setBanner(banner: string | null, reason?: string): Promise<this> {
    return this.edit({ banner, reason });
  }

  /**
   * Sets the invite splash image of this guild, as a data URI, `null` to remove it.
   */
  public setSplash(splash: string | null, reason?: string): Promise<this> {
    return this.edit({ splash, reason });
  }

  /**
   * Sets the discovery splash image of this guild, as a data URI, `null` to remove it.
   */
  public setDiscoverySplash(discoverySplash: string | null, reason?: string): Promise<this> {
    return this.edit({ discoverySplash, reason });
  }

  public setSystemChannel(systemChannel: string | null, reason?: string): Promise<this> {
    return this.edit({ systemChannel, reason });
  }

  public setSystemChannelFlags(
    systemChannelFlags: SystemChannelFlagsResolvable,
    reason?: string,
  ): Promise<this> {
    return this.edit({ systemChannelFlags, reason });
  }

  public setAFKChannel(afkChannel: string | null, reason?: string): Promise<this> {
    return this.edit({ afkChannel, reason });
  }

  /**
   * Sets the AFK timeout of this guild, in seconds.
   */
  public setAFKTimeout(
    afkTimeout: RESTPatchAPIGuildJSONBody["afk_timeout"],
    reason?: string,
  ): Promise<this> {
    return this.edit({ afkTimeout, reason });
  }

  public setRulesChannel(rulesChannel: string | null, reason?: string): Promise<this> {
    return this.edit({ rulesChannel, reason });
  }

  public setPublicUpdatesChannel(
    publicUpdatesChannel: string | null,
    reason?: string,
  ): Promise<this> {
    return this.edit({ publicUpdatesChannel, reason });
  }

  public setSafetyAlertsChannel(
    safetyAlertsChannel: string | null,
    reason?: string,
  ): Promise<this> {
    return this.edit({ safetyAlertsChannel, reason });
  }

  public setVerificationLevel(
    verificationLevel: GuildVerificationLevel | null,
    reason?: string,
  ): Promise<this> {
    return this.edit({ verificationLevel, reason });
  }

  public setExplicitContentFilter(
    explicitContentFilter: GuildExplicitContentFilter | null,
    reason?: string,
  ): Promise<this> {
    return this.edit({ explicitContentFilter, reason });
  }

  public setDefaultMessageNotifications(
    defaultMessageNotifications: GuildDefaultMessageNotifications | null,
    reason?: string,
  ): Promise<this> {
    return this.edit({ defaultMessageNotifications, reason });
  }

  public setPreferredLocale(preferredLocale: Locale | null, reason?: string): Promise<this> {
    return this.edit({ preferredLocale, reason });
  }

  public setPremiumProgressBarEnabled(enabled = true, reason?: string): Promise<this> {
    return this.edit({ premiumProgressBarEnabled: enabled, reason });
  }

  /**
   * Transfers the ownership of this guild to another member. The client user must own the guild.
   *
   * @param owner The ID of the new owner.
   */
  public setOwner(owner: string, reason?: string): Promise<this> {
    return this.edit({ owner, reason });
  }

  /**
   * Pauses or resumes invites to this guild, through the `INVITES_DISABLED` feature.
   *
   * @param disabled Whether to pause invites.
   */
  public disableInvites(disabled = true): Promise<this> {
    const features: GuildFeature[] = this.features.filter(
      (feature) => feature !== GuildFeature.InvitesDisabled,
    );
    if (disabled) features.push(GuildFeature.InvitesDisabled);
    return this.edit({ features });
  }

  /**
   * Pauses invites or direct messages for up to a day, e.g. during a raid.
   *
   * @param options Until when to pause each, `null` to resume.
   */
  public async setIncidentActions(options: GuildIncidentActionsOptions): Promise<APIIncidentsData> {
    const incidents = await getGatewayClient().guilds.setIncidentActions(this.id, options);
    this[kPatch]({ incidents_data: incidents });
    return incidents;
  }

  /**
   * Makes the client user leave this guild.
   */
  public async leave(): Promise<this> {
    await getGatewayClient().guilds.leave(this.id);
    return this;
  }

  /**
   * Deletes this guild. The client user must own it.
   */
  public async delete(): Promise<this> {
    await getGatewayClient().guilds.delete(this.id);
    return this;
  }

  /**
   * Whether this guild has the same data as another one.
   * @param guild The guild to compare with.
   */
  public equals(guild: Guild): boolean {
    return (
      this.id === guild.id &&
      this.name === guild.name &&
      this.icon === guild.icon &&
      this.splash === guild.splash &&
      this.discoverySplash === guild.discoverySplash &&
      this.ownerId === guild.ownerId &&
      this.afkTimeout === guild.afkTimeout &&
      this.afkChannelId === guild.afkChannelId &&
      this.systemChannelId === guild.systemChannelId &&
      this.verificationLevel === guild.verificationLevel &&
      this.explicitContentFilter === guild.explicitContentFilter &&
      this.mfaLevel === guild.mfaLevel &&
      this.banner === guild.banner &&
      this.description === guild.description &&
      this.vanityURLCode === guild.vanityURLCode &&
      this.features.length === guild.features.length &&
      this.features.every((feature) => guild.features.includes(feature))
    );
  }
}
