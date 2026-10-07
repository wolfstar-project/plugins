import type { BaseImageURLOptions } from "@discordjs/rest";
import type { CacheEntityTypes } from "@wolfstar/plugin-cache";
import {
  GuildFeature,
  GuildPremiumTier,
  type APIGuild,
  type APIVoiceRegion,
  type GuildDefaultMessageNotifications,
  type GuildExplicitContentFilter,
  type GuildVerificationLevel,
  type Locale,
  type RESTGetAPIGuildVanityUrlResult,
  type RESTPatchAPIGuildJSONBody,
} from "discord-api-types/v10";
import type { AutoModerationRuleManager } from "../../managers/AutoModerationRuleManager.js";
import type { ChannelInfoRequestOptions } from "../../managers/ChannelManager.js";
import type { VoiceChannel } from "../channels/VoiceChannel.js";
import type { GuildBanManager } from "../../managers/GuildBanManager.js";
import type { GuildScheduledEventManager } from "../../managers/GuildScheduledEventManager.js";
import type { GuildSoundboardSoundManager } from "../../managers/GuildSoundboardSoundManager.js";
import type { StageInstanceManager } from "../../managers/StageInstanceManager.js";
import type { GuildChannelManager } from "../../managers/GuildChannelManager.js";
import type { FetchedThreads } from "../../managers/ThreadManager.js";
import type { GuildEmojiManager } from "../../managers/GuildEmojiManager.js";
import type { GuildIntegrationManager } from "../../managers/GuildIntegrationManager.js";
import type {
  GuildMemberManager,
  GuildMembersRequestOptions,
} from "../../managers/GuildMemberManager.js";
import type {
  GuildAuditLogs,
  GuildAuditLogsFetchOptions,
  GuildIncidentActionsOptions,
  GuildOnboardingEditOptions,
  GuildWelcomeScreenEditOptions,
  GuildWidgetSettings,
  GuildWidgetSettingsEditOptions,
} from "../../managers/GuildManager.js";
import type { GuildTemplateCreateOptions } from "../../managers/GuildTemplateManager.js";
import type { GuildInviteManager } from "../../managers/GuildInviteManager.js";
import type { PresenceManager } from "../../managers/PresenceManager.js";
import type { RoleManager } from "../../managers/RoleManager.js";
import type { VoiceStateManager } from "../../managers/VoiceStateManager.js";
import type { GuildStickerManager } from "../../managers/GuildStickerManager.js";
import { isPromiseLike } from "../../util/cache.js";
import { cdn } from "../../util/cdn.js";
import type { ImageResolvable } from "../../util/DataResolver.js";
import type {
  GuildSearchMessagesOptions,
  GuildSearchMessagesResult,
} from "../../util/messageSearch.js";
import { transformAPIIncidentsData, type IncidentActions } from "../../util/Transformers.js";
import type { Webhook } from "../webhooks/Webhook.js";
import { SystemChannelFlagsBitField, type SystemChannelFlagsResolvable } from "../../util/flags.js";
import { AnonymousGuild } from "./AnonymousGuild.js";
import type { GuildInvite } from "../invites/GuildInvite.js";
import type { GuildMember } from "./GuildMember.js";
import type { GuildOnboarding } from "./GuildOnboarding.js";
import type { GuildPreview } from "./GuildPreview.js";
import type { GuildTemplate } from "./GuildTemplate.js";
import type { Integration } from "./Integration.js";
import type { WelcomeScreen } from "./WelcomeScreen.js";
import type { Widget } from "./Widget.js";
import type { AnyChannel } from "../../managers/ChannelManager.js";
import { kData, kPatch, kPatchRelations, kRelations } from "../Structure.js";

/**
 * The relations of a {@link Guild}: its special channels, resolved from the cache by `client.guilds`.
 */
export interface GuildRelations {
  afkChannel?: AnyChannel | null;
  systemChannel?: AnyChannel | null;
  widgetChannel?: AnyChannel | null;
  rulesChannel?: AnyChannel | null;
  publicUpdatesChannel?: AnyChannel | null;
  safetyAlertsChannel?: AnyChannel | null;
}

/**
 * The raw field holding the ID of each channel of {@link GuildRelations}.
 *
 * @internal
 */
export const GuildChannelFields = {
  afkChannel: "afk_channel_id",
  systemChannel: "system_channel_id",
  widgetChannel: "widget_channel_id",
  rulesChannel: "rules_channel_id",
  publicUpdatesChannel: "public_updates_channel_id",
  safetyAlertsChannel: "safety_alerts_channel_id",
} as const satisfies Record<keyof GuildRelations, string>;

/**
 * The options to edit a guild with. Images are data URIs (`data:image/png;base64,...`) or anything `resolveImage`
 * reads (contents, a path, a URL, a stream, a blob), channels are IDs.
 */
export interface GuildEditOptions {
  afkChannel?: string | null;
  afkTimeout?: RESTPatchAPIGuildJSONBody["afk_timeout"];
  banner?: ImageResolvable | null;
  defaultMessageNotifications?: GuildDefaultMessageNotifications | null;
  description?: string | null;
  discoverySplash?: ImageResolvable | null;
  explicitContentFilter?: GuildExplicitContentFilter | null;
  features?: APIGuild["features"];
  icon?: ImageResolvable | null;
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
  splash?: ImageResolvable | null;
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
  declare public [kRelations]: GuildRelations;

  /**
   * @param data The raw guild.
   * @param relations The channels of the guild, as resolved from the cache by `client.guilds`.
   */
  public constructor(data: CacheEntityTypes["guilds"], relations: GuildRelations = {}) {
    super(data, relations);
  }

  protected override optimizeData(data: Partial<CacheEntityTypes["guilds"]>): void {
    super.optimizeData(data);
    this.optimizeTimestamp("joined_at", data.joined_at);
  }

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
   * The channel members are moved to when idle, from the cache, like discord.js's `Guild#afkChannel`. `null` when
   * the guild has none, when it is not cached, or when the guild was not built by a manager.
   */
  public get afkChannel(): AnyChannel | null {
    return this.relatedChannel("afkChannel");
  }

  /**
   * The channel system messages are sent to, from the cache.
   */
  public get systemChannel(): AnyChannel | null {
    return this.relatedChannel("systemChannel");
  }

  /**
   * The channel the widget's invite leads to, from the cache.
   */
  public get widgetChannel(): AnyChannel | null {
    return this.relatedChannel("widgetChannel");
  }

  /**
   * The rules channel of a community guild, from the cache.
   */
  public get rulesChannel(): AnyChannel | null {
    return this.relatedChannel("rulesChannel");
  }

  /**
   * The channel Discord sends community updates to, from the cache.
   */
  public get publicUpdatesChannel(): AnyChannel | null {
    return this.relatedChannel("publicUpdatesChannel");
  }

  /**
   * The channel Discord sends safety alerts to, from the cache.
   */
  public get safetyAlertsChannel(): AnyChannel | null {
    return this.relatedChannel("safetyAlertsChannel");
  }

  /**
   * Gets one of the channels of {@link GuildRelations}: the one `client.guilds` resolved, else, for guilds built
   * without their channels (e.g. `message.guild`), a lookup in a synchronous cache.
   */
  private relatedChannel(name: keyof GuildRelations): AnyChannel | null {
    const resolved = this[kRelations][name];
    if (resolved !== undefined) return resolved;

    const channelId = (this[kData] as unknown as Record<string, string | null | undefined>)[
      GuildChannelFields[name]
    ];
    const { cache } = this.client.channels;
    if (!channelId || !cache.synchronous) return null;
    try {
      const channel = cache.get(channelId);
      if (!isPromiseLike(channel)) return channel ?? null;
      // A relation of the channel is read from an asynchronous cache. Nothing awaits the promise anymore, so its
      // rejection must not go unhandled.
      channel.catch(() => undefined);
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Forgets the channels a patch changes.
   *
   * @internal
   */
  public [kPatchRelations](data: object): void {
    this.dropChangedRelations(data, GuildChannelFields);
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
  public get incidentsData(): IncidentActions | null {
    const incidents = this[kData].incidents_data;
    return incidents ? transformAPIIncidentsData(incidents) : null;
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
    return this.optimizedTimestamp("joined_at");
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
    return this.client.guilds.emojis(this.id);
  }

  /**
   * The custom stickers of the guild.
   */
  public get stickers(): GuildStickerManager {
    return this.client.guilds.stickers(this.id);
  }

  /**
   * Fetches the active threads of the guild, and caches them.
   */
  public fetchActiveThreads(): Promise<FetchedThreads> {
    return this.client.threads.fetchActive(this.id);
  }

  /**
   * Fetches the webhooks of the guild.
   */
  public fetchWebhooks(): Promise<Webhook[]> {
    return this.client.webhooks.fetchGuild(this.id);
  }

  /**
   * The scheduled events of the guild.
   */
  public get scheduledEvents(): GuildScheduledEventManager {
    return this.client.guilds.scheduledEvents(this.id);
  }

  /**
   * The live stages of the guild.
   */
  public get stageInstances(): StageInstanceManager {
    return this.client.guilds.stageInstances(this.id);
  }

  /**
   * The soundboard sounds of the guild.
   */
  public get soundboardSounds(): GuildSoundboardSoundManager {
    return this.client.guilds.soundboardSounds(this.id);
  }

  /**
   * The integrations of the guild.
   */
  public get integrations(): GuildIntegrationManager {
    return this.client.guilds.integrations(this.id);
  }

  /**
   * Fetches every integration of the guild.
   */
  public fetchIntegrations(): Promise<Integration[]> {
    return this.integrations.fetchAll();
  }

  /**
   * Fetches the templates of the guild.
   */
  public fetchTemplates(): Promise<GuildTemplate[]> {
    return this.client.templates.list(this.id);
  }

  /**
   * Creates a template of the guild.
   *
   * @param name The name of the template.
   * @param description The description of the template.
   */
  public createTemplate(name: string, description?: string | null): Promise<GuildTemplate> {
    const options: GuildTemplateCreateOptions = { name, description };
    return this.client.templates.create(this.id, options);
  }

  /**
   * Fetches the welcome screen of the guild.
   */
  public fetchWelcomeScreen(): Promise<WelcomeScreen> {
    return this.client.guilds.fetchWelcomeScreen(this.id);
  }

  /**
   * Edits the welcome screen of the guild.
   *
   * @param options The changes to apply.
   */
  public editWelcomeScreen(options: GuildWelcomeScreenEditOptions): Promise<WelcomeScreen> {
    return this.client.guilds.editWelcomeScreen(this.id, options);
  }

  /**
   * Fetches the public widget of the guild, which must be enabled.
   */
  public fetchWidget(): Promise<Widget> {
    return this.client.fetchGuildWidget(this.id);
  }

  /**
   * Fetches whether the widget of the guild is enabled, and its channel.
   */
  public fetchWidgetSettings(): Promise<GuildWidgetSettings> {
    return this.client.guilds.fetchWidgetSettings(this.id);
  }

  /**
   * Edits the widget settings of the guild, and patches {@link Guild.widgetEnabled} and
   * {@link Guild.widgetChannelId} in place.
   *
   * @param options Whether to enable the widget, and its channel.
   */
  public async setWidgetSettings(options: GuildWidgetSettingsEditOptions): Promise<this> {
    const settings = await this.client.guilds.editWidgetSettings(this.id, options);
    return this[kPatch]({
      widget_enabled: settings.enabled,
      widget_channel_id: settings.channelId,
    });
  }

  /**
   * Fetches the onboarding of the guild.
   */
  public fetchOnboarding(): Promise<GuildOnboarding> {
    return this.client.guilds.fetchOnboarding(this.id);
  }

  /**
   * Edits the onboarding of the guild.
   *
   * @param options The changes to apply. The prompts replace every existing one.
   */
  public editOnboarding(options: GuildOnboardingEditOptions): Promise<GuildOnboarding> {
    return this.client.guilds.editOnboarding(this.id, options);
  }

  /**
   * The bans of the guild.
   */
  public get bans(): GuildBanManager {
    return this.client.guilds.bans(this.id);
  }

  /**
   * The auto moderation rules of the guild.
   */
  public get autoModerationRules(): AutoModerationRuleManager {
    return this.client.guilds.autoModerationRules(this.id);
  }

  /**
   * Fetches a page of the guild's audit log.
   *
   * @param options Which user and action to filter by, and the page.
   */
  public fetchAuditLogs(options?: GuildAuditLogsFetchOptions): Promise<GuildAuditLogs> {
    return this.client.guilds.fetchAuditLogs(this.id, options);
  }

  /**
   * Searches the messages of the guild, see `GuildManager#searchMessages`.
   *
   * @param options What to search for, and how.
   */
  public searchMessages(options?: GuildSearchMessagesOptions): Promise<GuildSearchMessagesResult> {
    return this.client.guilds.searchMessages(this.id, options);
  }

  /**
   * The channels of the guild.
   */
  public get channels(): GuildChannelManager {
    return this.client.guilds.channels(this.id);
  }

  /**
   * The invites of the guild.
   */
  public get invites(): GuildInviteManager {
    return this.client.guilds.invites(this.id);
  }

  /**
   * The presences of the guild: `guild.presences.cache.get(userId)`.
   */
  public get presences(): PresenceManager<true> {
    return this.client.guilds.presences(this.id);
  }

  /**
   * The members of the guild: `guild.members.cache.get(userId)`.
   */
  public get members(): GuildMemberManager<true> {
    return this.client.guilds.members(this.id);
  }

  /**
   * The roles of the guild: `guild.roles.cache.get(roleId)`.
   */
  public get roles(): RoleManager<true> {
    return this.client.guilds.roles(this.id);
  }

  /**
   * The voice states of the guild: `guild.voiceStates.cache.get(userId)`.
   */
  public get voiceStates(): VoiceStateManager<true> {
    return this.client.guilds.voiceStates(this.id);
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
    const guild = await this.client.guilds.fetch(this.id, { force: true });
    return this[kPatch](guild.toJSON());
  }

  /**
   * Fetches the member owning this guild.
   */
  public fetchOwner(): Promise<GuildMember> {
    return this.client.members.fetch(this.id, this.ownerId);
  }

  /**
   * Requests the members of this guild over the gateway, every one of them by default, and caches them. discord.js:
   * `guild.members.fetch()`. See `client.members.request`.
   *
   * @param options Which members to request.
   */
  public requestMembers(options?: GuildMembersRequestOptions): Promise<GuildMember[]> {
    return this.client.members.request(this.id, options);
  }

  /**
   * Requests the ephemeral info (status, start time of the voice session) of the voice channels of this guild over the
   * gateway, and caches it. discord.js: `guild.fetchChannelInfo()`. See `client.channels.requestInfo`.
   *
   * @param options The fields to request.
   */
  public requestChannelInfo(options: ChannelInfoRequestOptions): Promise<VoiceChannel[]> {
    return this.client.channels.requestInfo(this.id, options);
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
    return this.client.guilds.fetchPreview(this.id);
  }

  /**
   * Fetches the voice regions available to this guild.
   */
  public fetchVoiceRegions(): Promise<APIVoiceRegion[]> {
    return this.client.guilds.fetchVoiceRegions(this.id);
  }

  /**
   * Fetches the vanity URL of this guild, patching {@link AnonymousGuild.vanityURLCode} in place.
   */
  public async fetchVanityData(): Promise<RESTGetAPIGuildVanityUrlResult> {
    const data = await this.client.guilds.fetchVanityData(this.id);
    this[kPatch]({ vanity_url_code: data.code });
    return data;
  }

  /**
   * Edits this guild.
   *
   * @param options The changes to apply.
   */
  public async edit(options: GuildEditOptions): Promise<this> {
    const guild = await this.client.guilds.edit(this.id, options);
    return this[kPatch](guild.toJSON());
  }

  public setName(name: string, reason?: string): Promise<this> {
    return this.edit({ name, reason });
  }

  /**
   * Sets the icon of this guild, `null` to remove it.
   */
  public setIcon(icon: ImageResolvable | null, reason?: string): Promise<this> {
    return this.edit({ icon, reason });
  }

  /**
   * Sets the banner of this guild, `null` to remove it.
   */
  public setBanner(banner: ImageResolvable | null, reason?: string): Promise<this> {
    return this.edit({ banner, reason });
  }

  /**
   * Sets the invite splash image of this guild, `null` to remove it.
   */
  public setSplash(splash: ImageResolvable | null, reason?: string): Promise<this> {
    return this.edit({ splash, reason });
  }

  /**
   * Sets the discovery splash image of this guild, `null` to remove it.
   */
  public setDiscoverySplash(
    discoverySplash: ImageResolvable | null,
    reason?: string,
  ): Promise<this> {
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
  public async setIncidentActions(options: GuildIncidentActionsOptions): Promise<IncidentActions> {
    const incidents = await this.client.guilds.setIncidentActions(this.id, options);
    this[kPatch]({
      incidents_data: {
        invites_disabled_until: incidents.invitesDisabledUntil?.toISOString() ?? null,
        dms_disabled_until: incidents.dmsDisabledUntil?.toISOString() ?? null,
        dm_spam_detected_at: incidents.dmSpamDetectedAt?.toISOString() ?? null,
        raid_detected_at: incidents.raidDetectedAt?.toISOString() ?? null,
      },
    });
    return incidents;
  }

  /**
   * Makes the client user leave this guild.
   */
  public async leave(): Promise<this> {
    await this.client.guilds.leave(this.id);
    return this;
  }

  /**
   * Deletes this guild. The client user must own it.
   */
  public async delete(): Promise<this> {
    await this.client.guilds.delete(this.id);
    return this;
  }

  /**
   * Whether this guild has the same data as another one, like discord.js's `Guild#equals`: the same ID, availability,
   * name, icon, splashes, owner, member count, `large`, verification level, and features, in the same order. `false`
   * for anything that is not a guild.
   *
   * @param guild The guild to compare with.
   */
  public equals(guild: unknown): boolean {
    return (
      guild instanceof Guild &&
      this.id === guild.id &&
      this.available === guild.available &&
      this.splash === guild.splash &&
      this.discoverySplash === guild.discoverySplash &&
      this.name === guild.name &&
      this.memberCount === guild.memberCount &&
      this.large === guild.large &&
      this.icon === guild.icon &&
      this.ownerId === guild.ownerId &&
      this.verificationLevel === guild.verificationLevel &&
      this.features.length === guild.features.length &&
      this.features.every((feature, index) => feature === guild.features[index])
    );
  }
}
