import type { CacheEntityTypes } from "@wolfstar/plugin-cache";
import {
  GatewayDispatchEvents,
  GatewayOpcodes,
  type APIGuild,
  type APIIncidentsData,
  type APIVoiceRegion,
  type RESTGetAPIGuildVanityUrlResult,
  type RESTPatchAPIGuildJSONBody,
  type RESTPostAPIGuildsJSONBody,
  type RESTPutAPIGuildIncidentActionsJSONBody,
  type APIApplicationCommand,
  type APIGuildScheduledEvent,
  type APIThreadChannel,
  type AuditLogEvent,
  type GuildOnboardingMode,
  type GuildOnboardingPromptType,
  type APIGuildWelcomeScreen,
  type RESTPatchAPIGuildWelcomeScreenJSONBody,
  type RESTPatchAPIGuildWidgetSettingsJSONBody,
  type RESTPutAPIGuildOnboardingJSONBody,
} from "discord-api-types/v10";
import { applyGatewayDispatch } from "@wolfstar/plugin-cache";
import type { GatewayClient } from "../GatewayClient.js";
import { AnonymousGuild } from "../structures/AnonymousGuild.js";
import { Guild, type GuildEditOptions } from "../structures/Guild.js";
import { GuildPreview } from "../structures/GuildPreview.js";
import { GuildAuditLogsEntry } from "../structures/GuildAuditLogsEntry.js";
import { GuildOnboarding } from "../structures/GuildOnboarding.js";
import type { Integration } from "../structures/Integration.js";
import { ReactionEmoji, type EmojiIdentifierResolvable } from "../structures/ReactionEmoji.js";
import { WelcomeScreen } from "../structures/WelcomeScreen.js";
import type { AutoModerationRule } from "../structures/AutoModerationRule.js";
import type { User } from "../structures/User.js";
import { Webhook } from "../structures/Webhook.js";
import { resolveId, type IdResolvable } from "../util/channels.js";
import { SystemChannelFlagsBitField } from "../util/flags.js";
import { CachedManager } from "./CachedManager.js";
import { AutoModerationRuleManager } from "./AutoModerationRuleManager.js";
import { GuildBanManager } from "./GuildBanManager.js";
import { GuildChannelManager } from "./GuildChannelManager.js";
import { GuildIntegrationManager } from "./GuildIntegrationManager.js";
import { GuildScheduledEventManager } from "./GuildScheduledEventManager.js";
import { GuildSoundboardSoundManager } from "./GuildSoundboardSoundManager.js";
import { StageInstanceManager } from "./StageInstanceManager.js";
import type { AnyThreadChannel } from "./ThreadManager.js";
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
 * The options to fetch a page of a guild's audit log with.
 */
export interface GuildAuditLogsFetchOptions {
  /**
   * Only the entries of this user's actions.
   */
  user?: IdResolvable;
  /**
   * Only the entries of this action.
   */
  type?: AuditLogEvent;
  /**
   * The entry (or ID) to fetch entries before.
   */
  before?: IdResolvable;
  after?: IdResolvable;
  /**
   * How many entries to fetch, up to 100.
   */
  limit?: number;
}

/**
 * A page of a guild's audit log, with the entities its entries refer to.
 */
export interface GuildAuditLogs {
  entries: GuildAuditLogsEntry[];
  users: User[];
  webhooks: Webhook[];
  autoModerationRules: AutoModerationRule[];
  threads: AnyThreadChannel[];
  /**
   * The integrations the entries refer to, partial: an ID, a name, a type, and an account.
   */
  integrations: Integration[];
  applicationCommands: APIApplicationCommand[];
  guildScheduledEvents: APIGuildScheduledEvent[];
}

/**
 * A channel to suggest in a welcome screen.
 */
export interface WelcomeChannelData {
  channel: IdResolvable;
  description: string;
  emoji?: EmojiIdentifierResolvable | null;
}

/**
 * The options to edit a welcome screen with.
 */
export interface GuildWelcomeScreenEditOptions {
  enabled?: boolean;
  description?: string | null;
  welcomeChannels?: readonly WelcomeChannelData[];
  reason?: string;
}

/**
 * The widget settings of a guild.
 */
export interface GuildWidgetSettings {
  enabled: boolean;
  /**
   * The channel the widget's invite leads to.
   */
  channelId: string | null;
}

/**
 * The options to edit the widget settings of a guild with.
 */
export interface GuildWidgetSettingsEditOptions {
  enabled?: boolean;
  channel?: IdResolvable | null;
  reason?: string;
}

/**
 * An answer of an onboarding prompt. Without an ID, it is a new one.
 */
export interface GuildOnboardingPromptOptionData {
  id?: string;
  title: string;
  description?: string | null;
  channels?: readonly IdResolvable[];
  roles?: readonly IdResolvable[];
  emoji?: EmojiIdentifierResolvable | null;
}

/**
 * A question of an onboarding. Without an ID, it is a new one.
 */
export interface GuildOnboardingPromptData {
  id?: string;
  title: string;
  options: readonly GuildOnboardingPromptOptionData[];
  type?: GuildOnboardingPromptType;
  singleSelect?: boolean;
  required?: boolean;
  inOnboarding?: boolean;
}

/**
 * The options to edit an onboarding with. The prompts replace every existing one.
 */
export interface GuildOnboardingEditOptions {
  prompts?: readonly GuildOnboardingPromptData[];
  defaultChannels?: readonly IdResolvable[];
  enabled?: boolean;
  mode?: GuildOnboardingMode;
  reason?: string;
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
   * Gets the manager of a guild's scheduled events.
   *
   * @param guildId The ID of the guild.
   */
  public scheduledEvents(guildId: string): GuildScheduledEventManager {
    return new GuildScheduledEventManager(this.client, guildId);
  }

  /**
   * Gets the manager of a guild's stage instances.
   *
   * @param guildId The ID of the guild.
   */
  public stageInstances(guildId: string): StageInstanceManager {
    return new StageInstanceManager(this.client, guildId);
  }

  /**
   * Gets the manager of a guild's soundboard sounds.
   *
   * @param guildId The ID of the guild.
   */
  public soundboardSounds(guildId: string): GuildSoundboardSoundManager {
    return new GuildSoundboardSoundManager(this.client, guildId);
  }

  /**
   * Gets the manager of a guild's integrations.
   *
   * @param guildId The ID of the guild.
   */
  public integrations(guildId: string): GuildIntegrationManager {
    return new GuildIntegrationManager(this.client, guildId);
  }

  /**
   * Fetches the welcome screen of a guild.
   *
   * @param guildId The ID of the guild.
   */
  public async fetchWelcomeScreen(guildId: string): Promise<WelcomeScreen> {
    const screen = await this.client.core.api.guilds.getWelcomeScreen(guildId);
    return this.welcomeScreen(guildId, screen);
  }

  /**
   * Edits the welcome screen of a guild.
   *
   * @param guildId The ID of the guild.
   * @param options The changes to apply.
   */
  public async editWelcomeScreen(
    guildId: string,
    options: GuildWelcomeScreenEditOptions,
  ): Promise<WelcomeScreen> {
    const body: RESTPatchAPIGuildWelcomeScreenJSONBody = {
      enabled: options.enabled,
      description: options.description,
      welcome_channels: options.welcomeChannels?.map((channel) => {
        const emoji = channel.emoji ? ReactionEmoji.resolvePartial(channel.emoji) : null;
        return {
          channel_id: resolveId(channel.channel),
          description: channel.description,
          emoji_id: emoji?.id ?? null,
          emoji_name: emoji?.name ?? null,
        };
      }),
    };
    const screen = await this.client.core.api.guilds.editWelcomeScreen(guildId, body, {
      reason: options.reason,
    });
    return this.welcomeScreen(guildId, screen);
  }

  /**
   * Fetches whether the widget of a guild is enabled, and its channel.
   *
   * @param guildId The ID of the guild.
   */
  public async fetchWidgetSettings(guildId: string): Promise<GuildWidgetSettings> {
    const settings = await this.client.core.api.guilds.getWidgetSettings(guildId);
    return { enabled: settings.enabled, channelId: settings.channel_id };
  }

  /**
   * Edits the widget settings of a guild, and patches the cached guild.
   *
   * @param guildId The ID of the guild.
   * @param options Whether to enable the widget, and its channel.
   */
  public async editWidgetSettings(
    guildId: string,
    options: GuildWidgetSettingsEditOptions,
  ): Promise<GuildWidgetSettings> {
    const body: RESTPatchAPIGuildWidgetSettingsJSONBody = {
      enabled: options.enabled,
      channel_id:
        options.channel === undefined ? undefined : options.channel && resolveId(options.channel),
    };
    const settings = await this.client.core.api.guilds.editWidgetSettings(guildId, body, {
      reason: options.reason,
    });
    const cached = await this.cache?.get(guildId);
    if (cached) {
      await this.cache!.set(guildId, {
        ...cached,
        widget_enabled: settings.enabled,
        widget_channel_id: settings.channel_id,
      });
    }

    return { enabled: settings.enabled, channelId: settings.channel_id };
  }

  /**
   * Fetches the onboarding of a guild.
   *
   * @param guildId The ID of the guild.
   */
  public async fetchOnboarding(guildId: string): Promise<GuildOnboarding> {
    const onboarding = await this.client.core.api.guilds.getOnboarding(guildId);
    return new GuildOnboarding(onboarding, { guild: await this.cachedGuild(guildId) });
  }

  /**
   * Edits the onboarding of a guild.
   *
   * @param guildId The ID of the guild.
   * @param options The changes to apply. The prompts replace every existing one.
   */
  public async editOnboarding(
    guildId: string,
    options: GuildOnboardingEditOptions,
  ): Promise<GuildOnboarding> {
    const body: RESTPutAPIGuildOnboardingJSONBody = {
      prompts: options.prompts?.map((prompt) => ({
        id: prompt.id ?? placeholderId(),
        title: prompt.title,
        type: prompt.type,
        single_select: prompt.singleSelect,
        required: prompt.required,
        in_onboarding: prompt.inOnboarding,
        options: prompt.options.map((option) => {
          const emoji = option.emoji ? ReactionEmoji.resolvePartial(option.emoji) : null;
          return {
            id: option.id ?? placeholderId(),
            title: option.title,
            description: option.description,
            channel_ids: option.channels?.map(resolveId),
            role_ids: option.roles?.map(resolveId),
            emoji_id: emoji?.id,
            emoji_name: emoji?.name,
            emoji_animated: emoji?.animated,
          };
        }),
      })),
      default_channel_ids: options.defaultChannels?.map(resolveId),
      enabled: options.enabled,
      mode: options.mode,
    };
    const onboarding = await this.client.core.api.guilds.editOnboarding(guildId, body, {
      reason: options.reason,
    });
    return new GuildOnboarding(onboarding, { guild: await this.cachedGuild(guildId) });
  }

  /**
   * Gets the manager of a guild's bans.
   *
   * @param guildId The ID of the guild.
   */
  public bans(guildId: string): GuildBanManager {
    return new GuildBanManager(this.client, guildId);
  }

  /**
   * Gets the manager of a guild's auto moderation rules.
   *
   * @param guildId The ID of the guild.
   */
  public autoModerationRules(guildId: string): AutoModerationRuleManager {
    return new AutoModerationRuleManager(this.client, guildId);
  }

  /**
   * Fetches a page of a guild's audit log, newest first, and caches its users.
   *
   * @param guildId The ID of the guild.
   * @param options Which user and action to filter by, and the page.
   */
  public async fetchAuditLogs(
    guildId: string,
    options: GuildAuditLogsFetchOptions = {},
  ): Promise<GuildAuditLogs> {
    const log = await this.client.core.api.guilds.getAuditLogs(guildId, {
      user_id: options.user && resolveId(options.user),
      action_type: options.type,
      before: options.before && resolveId(options.before),
      after: options.after && resolveId(options.after),
      limit: options.limit,
    });
    const [users, guild] = await Promise.all([
      Promise.all(log.users.map((user) => this.client.users._add(user))),
      this.cachedGuild(guildId),
    ]);
    const usersById = new Map(users.map((user) => [user.id, user]));
    const rules = this.autoModerationRules(guildId);
    const integrations = this.integrations(guildId);

    return {
      entries: log.audit_log_entries.map(
        (entry) =>
          new GuildAuditLogsEntry(
            { ...entry, guild_id: guildId },
            { executor: (entry.user_id && usersById.get(entry.user_id)) || null, guild },
          ),
      ),
      users,
      webhooks: log.webhooks.map((webhook) => new Webhook(webhook)),
      autoModerationRules: await Promise.all(
        log.auto_moderation_rules.map((rule) => rules.hydrate(rule)),
      ),
      threads: await Promise.all(
        log.threads.map((thread) => this.client.threads.hydrate(thread as APIThreadChannel)),
      ),
      integrations: log.integrations.map((integration) =>
        integrations.createStructure({ ...integration, guild_id: guildId }),
      ),
      applicationCommands: log.application_commands,
      guildScheduledEvents: log.guild_scheduled_events,
    };
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
    const guilds = await this.client.core.api.users.getGuilds({
      limit: options.limit,
      before: options.before,
      after: options.after,
      with_counts: options.withCounts,
    });
    return guilds.map((guild) => new AnonymousGuild(guild));
  }

  /**
   * Creates a guild owned by the bot, which Discord only allows to bots in fewer than 10 guilds.
   *
   * @param options The guild's name and initial setup.
   */
  public async create(options: RESTPostAPIGuildsJSONBody): Promise<Guild> {
    const guild = await this.client.core.api.guilds.create(options);
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
    const guild = await this.client.core.api.guilds.edit(guildId, body, {
      reason: options.reason,
    });
    return this.store(guild);
  }

  /**
   * Makes the bot leave a guild, and drops it from the cache with everything it scopes.
   *
   * @param guildId The ID of the guild.
   */
  public async leave(guildId: string): Promise<void> {
    await this.client.core.api.users.leaveGuild(guildId);
    await this.forget(guildId);
  }

  /**
   * Deletes a guild the bot owns, and drops it from the cache with everything it scopes.
   *
   * @param guildId The ID of the guild.
   */
  public async delete(guildId: string): Promise<void> {
    await this.client.core.api.guilds.delete(guildId);
    await this.forget(guildId);
  }

  /**
   * Fetches the public preview of a guild.
   *
   * @param guildId The ID of the guild.
   */
  public async fetchPreview(guildId: string): Promise<GuildPreview> {
    return new GuildPreview(await this.client.core.api.guilds.getPreview(guildId));
  }

  /**
   * Fetches the voice regions available to a guild.
   *
   * @param guildId The ID of the guild.
   */
  public async fetchVoiceRegions(guildId: string): Promise<APIVoiceRegion[]> {
    return this.client.core.api.guilds.getVoiceRegions(guildId);
  }

  /**
   * Fetches the vanity invite code of a guild and how many times it was used.
   *
   * @param guildId The ID of the guild.
   */
  public async fetchVanityData(guildId: string): Promise<RESTGetAPIGuildVanityUrlResult> {
    return this.client.core.api.guilds.getVanityURL(guildId);
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
    const incidents = await this.client.core.api.guilds.editIncidentActions(guildId, body);
    const cached = await this.cache?.get(guildId);
    if (cached) await this.cache!.set(guildId, { ...cached, incidents_data: incidents });
    return incidents;
  }

  protected async fetchRaw(guildId: string) {
    return this.client.core.api.guilds.get(guildId, { with_counts: true });
  }

  private store(guild: APIGuild): Promise<Guild> {
    return this._add(guild);
  }

  private async welcomeScreen(
    guildId: string,
    screen: APIGuildWelcomeScreen,
  ): Promise<WelcomeScreen> {
    return new WelcomeScreen(
      { ...screen, guild_id: guildId },
      { guild: await this.cachedGuild(guildId) },
    );
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

// Discord requires an ID on every prompt and option, and takes any snowflake for the new ones.
let placeholderSequence = 0;
function placeholderId(): string {
  placeholderSequence = (placeholderSequence + 1) % 4096;
  return String(((BigInt(Date.now()) - 1_420_070_400_000n) << 22n) | BigInt(placeholderSequence));
}

function toISO(value: Date | number | null | undefined): string | null | undefined {
  return value === undefined || value === null ? value : new Date(value).toISOString();
}
