import type { Awaitable, CacheEntityTypes } from "@wolfstar/plugin-cache";
import { setTimeout as sleep } from "node:timers/promises";
import { Collection } from "@discordjs/collection";
import {
  GatewayDispatchEvents,
  GatewayOpcodes,
  GuildWidgetStyle,
  RESTJSONErrorCodes,
  RouteBases,
  Routes,
  type APIGuild,
  type APIMessageSearchResult,
  type RESTGetAPIGuildMessagesSearchResult,
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
  type APIGuildOnboarding,
  type RESTPatchAPIGuildWelcomeScreenJSONBody,
  type RESTPatchAPIGuildWidgetSettingsJSONBody,
  type RESTPutAPIGuildOnboardingJSONBody,
} from "discord-api-types/v10";
import { applyGatewayDispatch } from "@wolfstar/plugin-cache";
import { resolveImageOption } from "../util/DataResolver.js";
import { transformAPIIncidentsData, type IncidentActions } from "../util/Transformers.js";
import type { GatewayClient } from "../GatewayClient.js";
import { AnonymousGuild } from "../structures/guilds/AnonymousGuild.js";
import {
  Guild,
  GuildChannelFields,
  type GuildEditOptions,
  type GuildRelations,
} from "../structures/guilds/Guild.js";
import { bindClient } from "../structures/Structure.js";
import { resolveAuditLogTarget, type AuditLogEntities } from "../util/auditLogs.js";
import { whenAll } from "../util/cache.js";
import { GuildSoundboardSoundsTimeoutError } from "../util/errors.js";
import { shardIdOf } from "../util/shards.js";
import type { SoundboardSound } from "../structures/soundboards/SoundboardSound.js";
import { GuildPreview } from "../structures/guilds/GuildPreview.js";
import { GuildAuditLogsEntry } from "../structures/guilds/GuildAuditLogsEntry.js";
import { GuildOnboarding } from "../structures/guilds/GuildOnboarding.js";
import type { Integration } from "../structures/guilds/Integration.js";
import {
  ReactionEmoji,
  type EmojiIdentifierResolvable,
} from "../structures/emojis/ReactionEmoji.js";
import { WelcomeScreen } from "../structures/guilds/WelcomeScreen.js";
import type { AutoModerationRule } from "../structures/automoderation/AutoModerationRule.js";
import type { User } from "../structures/users/User.js";
import type { Webhook } from "../structures/webhooks/Webhook.js";
import { GatewayError, GatewayTypeError } from "../errors/GatewayError.js";
import type { GuildResolvable } from "../types.js";
import type { ThreadMember } from "../structures/channels/ThreadMember.js";
import { resolveId, type IdResolvable } from "../util/channels.js";
import {
  toSearchQuery,
  type GuildSearchMessagesOptions,
  type GuildSearchMessagesResult,
} from "../util/messageSearch.js";
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
import { PresenceManager } from "./PresenceManager.js";
import { RoleManager } from "./RoleManager.js";
import { GuildMemberManager } from "./GuildMemberManager.js";
import { VoiceStateManager } from "./VoiceStateManager.js";
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
 * The options to request the soundboard sounds of guilds over the gateway with.
 */
export interface GuildSoundboardSoundsRequestOptions {
  /**
   * How long to wait for the replies, in milliseconds, before rejecting with a `GuildSoundboardSoundsTimeoutError`. Each
   * reply restarts it.
   *
   * @default 10_000
   */
  time?: number;
}

interface SoundboardSoundsRequest {
  // The requested guilds, in the order of the result.
  ids: string[];
  // The guilds whose sounds did not arrive yet.
  pending: Set<string>;
  sounds: Collection<string, Collection<string, SoundboardSound>>;
  timer: NodeJS.Timeout | null;
  resolve(sounds: Collection<string, Collection<string, SoundboardSound>>): void;
  reject(error: Error): void;
}

/**
 * Manages the {@link Guild}s known to the client.
 */
export class GuildManager extends CachedManager<"guilds", Guild, [guildId: string]> {
  // The pending `fetchSoundboardSounds`: the replies carry no nonce, so they are matched to a request by guild.
  readonly #soundboardRequests = new Set<SoundboardSoundsRequest>();

  public constructor(client: GatewayClient) {
    super(client, "guilds");
  }

  protected createStructure(data: CacheEntityTypes["guilds"]): Guild {
    return new Guild(data);
  }

  public keyOf(data: CacheEntityTypes["guilds"]): string {
    return data.id;
  }

  /**
   * Builds a guild, resolving its AFK, system, widget, rules, public updates, and safety alerts channels from the
   * cache.
   *
   * @internal
   */
  public override _hydrate(data: CacheEntityTypes["guilds"]): Awaitable<Guild> {
    const relations: GuildRelations = {};
    // The channels resolve their guild to this very structure, rather than reading it again.
    const guild = bindClient(new Guild(data, relations), this.client);
    const fields = Object.entries(GuildChannelFields) as [keyof GuildRelations, string][];
    return whenAll(
      fields.map(([, key]) => {
        const channelId = (data as unknown as Record<string, string | null | undefined>)[key];
        return channelId ? this.client.channels._getInGuild(channelId, guild) : null;
      }),
      (channels) => {
        for (const [index, [name]] of fields.entries()) relations[name] = channels[index] ?? null;
        return guild;
      },
    );
  }

  /**
   * Gets a guild from the cache without resolving its channels, for the relations of other structures: a message
   * resolving its guild should not read six more channels. Its channel getters fall back to a synchronous cache.
   *
   * @param guildId The ID of the guild.
   * @internal
   */
  public _getShallow(guildId: string): Awaitable<Guild | undefined> {
    const read = this.guard("get", guildId, () => this.rawStore?.get(guildId), undefined);
    return whenAll([read], ([raw]) =>
      raw === undefined ? undefined : bindClient(this.createStructure(raw), this.client),
    );
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
   * Requests the soundboard sounds of several guilds over the gateway, and caches them. discord.js:
   * `client.guilds.fetchSoundboardSounds()`.
   *
   * @remarks
   * Discord answers with one `SOUNDBOARD_SOUNDS` dispatch per guild, which also updates the cache and is emitted as
   * `soundboardSounds`. The guilds are grouped by shard and each shard gets one request, so every shard of the guilds must
   * be one this client runs. The replies carry no nonce, so a reply resolves every pending request waiting for its guild,
   * and only the process that sent a request resolves it. A reply arriving after the request timed out is only cached.
   *
   * @param guildIds The IDs of the guilds, repeated IDs are requested once.
   * @param options How long to wait for the replies.
   * @returns The sounds of each guild, keyed by guild ID in the order of `guildIds` and then by sound ID, once all of them
   * are cached.
   */
  public async fetchSoundboardSounds(
    guildIds: readonly string[],
    options: GuildSoundboardSoundsRequestOptions = {},
  ): Promise<Collection<string, Collection<string, SoundboardSound>>> {
    const { time = 10_000 } = options;
    const ids = [...new Set(guildIds)];
    if (ids.length === 0) return new Collection();

    const shards = new Map<number, string[]>();
    for (const guildId of ids) {
      const shardId = await shardIdOf(this.client, guildId);
      const guilds = shards.get(shardId);
      if (guilds) guilds.push(guildId);
      else shards.set(shardId, [guildId]);
    }

    let request!: SoundboardSoundsRequest;
    const promise = new Promise<Collection<string, Collection<string, SoundboardSound>>>(
      (resolve, reject) => {
        request = {
          ids,
          pending: new Set(ids),
          sounds: new Collection(),
          timer: null,
          resolve,
          reject,
        };
      },
    );
    this.#soundboardRequests.add(request);

    try {
      await Promise.all(
        [...shards].map(([shardId, guild_ids]) =>
          this.client.gateway.send(shardId, {
            op: GatewayOpcodes.RequestSoundboardSounds,
            d: { guild_ids },
          }),
        ),
      );
    } catch (error) {
      this.#soundboardRequests.delete(request);
      throw error;
    }

    // The timeout starts once every payload is sent, not while one waits for its shard or its rate limit.
    if (this.#soundboardRequests.has(request)) {
      request.timer = setTimeout(() => {
        this.#soundboardRequests.delete(request);
        request.reject(new GuildSoundboardSoundsTimeoutError([...request.pending], time));
      }, time);
      request.timer.unref?.();
    }
    return promise;
  }

  /**
   * Hands the cached sounds of a `SOUNDBOARD_SOUNDS` dispatch to the pending requests waiting for their guild, resolving
   * the ones that now have every guild.
   *
   * @internal
   */
  public handleSoundboardSounds(sounds: SoundboardSound[], guildId: string): void {
    for (const request of this.#soundboardRequests) {
      if (!request.pending.delete(guildId)) continue;

      request.sounds.set(guildId, new Collection(sounds.map((sound) => [sound.soundId, sound])));
      request.timer?.refresh();
      if (request.pending.size > 0) continue;

      this.#soundboardRequests.delete(request);
      if (request.timer) clearTimeout(request.timer);
      request.resolve(
        new Collection(request.ids.map((id) => [id, request.sounds.get(id)!] as const)),
      );
    }
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
    const screen = await this.client.api.guilds.getWelcomeScreen(guildId);
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
    const screen = await this.client.api.guilds.editWelcomeScreen(guildId, body, {
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
    const settings = await this.client.api.guilds.getWidgetSettings(guildId);
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
    const settings = await this.client.api.guilds.editWidgetSettings(guildId, body, {
      reason: options.reason,
    });
    await this._patchCached(guildId, {
      widget_enabled: settings.enabled,
      widget_channel_id: settings.channel_id,
    });

    return { enabled: settings.enabled, channelId: settings.channel_id };
  }

  /**
   * Fetches the onboarding of a guild.
   *
   * @param guildId The ID of the guild.
   */
  public async fetchOnboarding(guildId: string): Promise<GuildOnboarding> {
    const onboarding = await this.client.api.guilds.getOnboarding(guildId);
    return this.onboarding(guildId, onboarding);
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
    const onboarding = await this.client.api.guilds.editOnboarding(guildId, body, {
      reason: options.reason,
    });
    return this.onboarding(guildId, onboarding);
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
    const log = await this.client.api.guilds.getAuditLogs(guildId, {
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
    const [webhooks, autoModerationRules, threads, pageIntegrations] = await Promise.all([
      Promise.all(log.webhooks.map((webhook) => this.client.webhooks.hydrate(webhook))),
      Promise.all(log.auto_moderation_rules.map((rule) => rules._build(rule))),
      Promise.all(
        log.threads.map((thread) => this.client.threads._build(thread as APIThreadChannel)),
      ),
      // Partial: the page only holds an ID, a name, a type, and an account.
      Promise.all(
        log.integrations.map((integration) =>
          integrations._build({ ...integration, guild_id: guildId } as never),
        ),
      ),
    ]);
    const entities: AuditLogEntities = {
      users: usersById,
      webhooks: new Map(webhooks.map((webhook) => [webhook.id, webhook])),
      integrations: new Map(pageIntegrations.map((integration) => [integration.id, integration])),
      applicationCommands: new Map(
        log.application_commands.map((command) => [command.id, command]),
      ),
    };

    return {
      entries: await Promise.all(
        log.audit_log_entries.map(async (raw) => {
          const entry = { ...raw, guild_id: guildId };
          return bindClient(
            new GuildAuditLogsEntry(entry, {
              executor: (entry.user_id && usersById.get(entry.user_id)) || null,
              guild,
              target: await resolveAuditLogTarget(this.client, entry, entities),
            }),
            this.client,
          );
        }),
      ),
      users,
      webhooks,
      autoModerationRules,
      threads,
      integrations: pageIntegrations,
      applicationCommands: log.application_commands,
      guildScheduledEvents: log.guild_scheduled_events,
    };
  }

  /**
   * Searches the messages of a guild.
   *
   * @remarks
   * Needs the `ReadMessageHistory` permission, and the content of the messages is empty without the `MessageContent`
   * intent. Discord may return fewer messages than `limit`, and `totalResults` is approximate while messages are
   * created or deleted, so do not paginate on `messages.size`: advance `offset` by `limit` until it passes
   * `totalResults`.
   *
   * While Discord indexes the guild, the search waits the `retry_after` it answers and retries until the index is
   * ready, so pass a `signal` to bound it, or `retryOnMissingIndex: false` to throw `SearchIndexNotYetAvailable`
   * instead. Threads of the results are cached before their messages.
   *
   * @param guildId The ID of the guild.
   * @param options What to search for, and how.
   * @throws {GatewayRangeError} When an option exceeds a limit Discord documents.
   * @throws {GatewayError} `SearchIndexNotYetAvailable` when the index is not ready and `retryOnMissingIndex` is
   * `false`, with the `retryAfter` (in seconds) and the `documentsIndexed` Discord answered.
   */
  public async searchMessages(
    guildId: string,
    options: GuildSearchMessagesOptions = {},
  ): Promise<GuildSearchMessagesResult> {
    const { cache = true, retryOnMissingIndex = true, signal } = options;
    const query = toSearchQuery(this.client, options);
    // `Routes.guildMessagesSearch` exists at runtime but is missing from the typings of discord-api-types@0.38.54.
    const route = `/guilds/${guildId}/messages/search` as const;

    for (;;) {
      const body = (await this.client.api.rest.get(route, {
        query,
        signal,
      })) as RESTGetAPIGuildMessagesSearchResult;
      if (!("code" in body) || body.code !== RESTJSONErrorCodes.IndexNotYetAvailable) {
        return this.searchResult(guildId, body as APIMessageSearchResult, cache);
      }

      // A `retry_after` of 0 means "after a short delay", not "now".
      const retryAfter =
        Number.isFinite(body.retry_after) && body.retry_after > 0 ? body.retry_after : 1;
      if (!retryOnMissingIndex) {
        const documentsIndexed = body.documents_indexed ?? 0;
        throw Object.assign(
          new GatewayError("SearchIndexNotYetAvailable", guildId, retryAfter, documentsIndexed),
          { retryAfter, documentsIndexed },
        );
      }

      // Clamped: a timer longer than 2^31 - 1 ms fires immediately.
      await sleep(Math.min(retryAfter * 1000, 2_147_483_647), undefined, { signal });
    }
  }

  private async searchResult(
    guildId: string,
    body: APIMessageSearchResult,
    cache: boolean,
  ): Promise<GuildSearchMessagesResult> {
    const threads: GuildSearchMessagesResult["threads"] = new Collection();
    // Before the messages, so that these resolve their thread from the cache.
    for (const raw of body.threads ?? []) {
      threads.set(
        raw.id,
        await this.client.threads._add({ ...raw, guild_id: raw.guild_id ?? guildId }, cache),
      );
    }

    const messages: GuildSearchMessagesResult["messages"] = new Collection();
    const added = await Promise.all(
      body.messages
        .flat()
        // The search leaves `reactions` out, and a message of an uncached channel still needs its guild.
        .map((message) =>
          this.client.messages._add({ ...message, guild_id: guildId } as never, cache),
        ),
    );
    for (const message of added) messages.set(message.id, message);

    const threadMembers: GuildSearchMessagesResult["threadMembers"] = new Collection();
    const members = await Promise.all(
      (body.members ?? []).map(
        async (raw) =>
          [
            raw,
            await this.client.threadMembers._add({ ...raw, guild_id: guildId }, cache),
          ] as const,
      ),
    );
    for (const [raw, member] of members) {
      if (!raw.id || !raw.user_id) continue;
      let ofThread: Collection<string, ThreadMember> | undefined = threadMembers.get(raw.id);
      if (!ofThread) threadMembers.set(raw.id, (ofThread = new Collection()));
      ofThread.set(raw.user_id, member);
    }

    return {
      messages,
      threads,
      threadMembers,
      totalResults: body.total_results,
      doingDeepHistoricalIndex: body.doing_deep_historical_index,
      ...(body.documents_indexed === undefined ? {} : { documentsIndexed: body.documents_indexed }),
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
   * Gets the manager of a guild's presences.
   *
   * @param guildId The ID of the guild.
   */
  public presences(guildId: string): PresenceManager<true> {
    return new PresenceManager<true>(this.client, guildId);
  }

  /**
   * Gets the manager of a guild's members.
   *
   * @param guildId The ID of the guild.
   */
  public members(guildId: string): GuildMemberManager<true> {
    return new GuildMemberManager<true>(this.client, guildId);
  }

  /**
   * Gets the manager of a guild's roles.
   *
   * @param guildId The ID of the guild.
   */
  public roles(guildId: string): RoleManager<true> {
    return new RoleManager<true>(this.client, guildId);
  }

  /**
   * Gets the manager of a guild's voice states.
   *
   * @param guildId The ID of the guild.
   */
  public voiceStates(guildId: string): VoiceStateManager<true> {
    return new VoiceStateManager<true>(this.client, guildId);
  }

  /**
   * Gets the URL of a guild's widget image.
   *
   * @param guild The guild, or anything carrying its ID.
   * @param style The style of the image.
   */
  public widgetImageURL(
    guild: GuildResolvable,
    style: GuildWidgetStyle = GuildWidgetStyle.Shield,
  ): string {
    const guildId =
      typeof guild === "string" ? guild : guild instanceof Guild ? guild.id : guild.guildId;
    if (!guildId) throw new GatewayTypeError("GuildResolve");
    return `${RouteBases.api}${Routes.guildWidgetImage(guildId)}?style=${style}`;
  }

  /**
   * Lists the guilds the bot is in, as the partial guilds the API returns, paginated by guild ID.
   *
   * @param options How many guilds to list (up to 200), around which guild ID, and whether to include counts.
   */
  public async fetchPartials(
    options: { limit?: number; before?: string; after?: string; withCounts?: boolean } = {},
  ): Promise<AnonymousGuild[]> {
    const guilds = await this.client.api.users.getGuilds({
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
    const guild = await this.client.api.guilds.create(options);
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
      icon: await resolveImageOption(options.icon),
      splash: await resolveImageOption(options.splash),
      discovery_splash: await resolveImageOption(options.discoverySplash),
      banner: await resolveImageOption(options.banner),
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
    const guild = await this.client.api.guilds.edit(guildId, body, {
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
    await this.client.api.users.leaveGuild(guildId);
    await this.forget(guildId);
  }

  /**
   * Deletes a guild the bot owns, and drops it from the cache with everything it scopes.
   *
   * @param guildId The ID of the guild.
   */
  public async delete(guildId: string): Promise<void> {
    await this.client.api.guilds.delete(guildId);
    await this.forget(guildId);
  }

  /**
   * Fetches the public preview of a guild.
   *
   * @param guildId The ID of the guild.
   */
  public async fetchPreview(guildId: string): Promise<GuildPreview> {
    return new GuildPreview(await this.client.api.guilds.getPreview(guildId));
  }

  /**
   * Fetches the voice regions available to a guild.
   *
   * @param guildId The ID of the guild.
   */
  public async fetchVoiceRegions(guildId: string): Promise<APIVoiceRegion[]> {
    return this.client.api.guilds.getVoiceRegions(guildId);
  }

  /**
   * Fetches the vanity invite code of a guild and how many times it was used.
   *
   * @param guildId The ID of the guild.
   */
  public async fetchVanityData(guildId: string): Promise<RESTGetAPIGuildVanityUrlResult> {
    return this.client.api.guilds.getVanityURL(guildId);
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
  ): Promise<IncidentActions> {
    const body: RESTPutAPIGuildIncidentActionsJSONBody = {
      invites_disabled_until: toISO(options.invitesDisabledUntil),
      dms_disabled_until: toISO(options.dmsDisabledUntil),
    };
    const incidents = await this.client.api.guilds.editIncidentActions(guildId, body);
    await this._patchCached(guildId, { incidents_data: incidents });
    return transformAPIIncidentsData(incidents);
  }

  protected async fetchRaw(guildId: string) {
    return this.client.api.guilds.get(guildId, { with_counts: true });
  }

  private store(guild: APIGuild): Promise<Guild> {
    return this._add(guild);
  }

  // Resolves the guild of a welcome screen, and the channels and custom emojis of its welcome channels.
  private async welcomeScreen(
    guildId: string,
    screen: APIGuildWelcomeScreen,
  ): Promise<WelcomeScreen> {
    const channels = screen.welcome_channels;
    const emojis = this.emojis(guildId);
    const [guild, cachedChannels, cachedEmojis] = await Promise.all([
      this.cachedGuild(guildId),
      cachedMap(
        channels.map((channel) => channel.channel_id),
        (id) => this.client.channels.cache.get(id),
      ),
      cachedMap(
        channels.flatMap((channel) => (channel.emoji_id ? [channel.emoji_id] : [])),
        (id) => emojis.cache.get(emojis.resolveKey(id)),
      ),
    ]);
    return bindClient(
      new WelcomeScreen(
        { ...screen, guild_id: guildId },
        { guild, channels: cachedChannels, emojis: cachedEmojis },
      ),
      this.client,
    );
  }

  // Resolves the guild of an onboarding, and the channels, roles, and custom emojis its prompts refer to.
  private async onboarding(
    guildId: string,
    onboarding: APIGuildOnboarding,
  ): Promise<GuildOnboarding> {
    const options = onboarding.prompts.flatMap((prompt) => prompt.options);
    const emojis = this.emojis(guildId);
    const [guild, channels, roles, cachedEmojis] = await Promise.all([
      this.cachedGuild(guildId),
      cachedMap(
        [...onboarding.default_channel_ids, ...options.flatMap((option) => option.channel_ids)],
        (id) => this.client.channels.cache.get(id),
      ),
      cachedMap(
        options.flatMap((option) => option.role_ids),
        (id) => this.client.roles.cache.get(this.client.roles.resolveKey(guildId, id)),
      ),
      cachedMap(
        options.flatMap((option) => (option.emoji?.id ? [option.emoji.id] : [])),
        (id) => emojis.cache.get(emojis.resolveKey(id)),
      ),
    ]);
    return bindClient(
      new GuildOnboarding(onboarding, { guild, channels, roles, emojis: cachedEmojis }),
      this.client,
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

// Reads the cached structures of some IDs, skipping the ones that are not cached (or whose read fails).
async function cachedMap<Value>(
  ids: readonly string[],
  get: (id: string) => Awaitable<Value | undefined>,
): Promise<Map<string, Value>> {
  const unique = [...new Set(ids)];
  const values = await Promise.all(
    unique.map(async (id) => {
      try {
        return await get(id);
      } catch {
        return undefined;
      }
    }),
  );
  const map = new Map<string, Value>();
  for (const [index, value] of values.entries()) if (value) map.set(unique[index]!, value);
  return map;
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
