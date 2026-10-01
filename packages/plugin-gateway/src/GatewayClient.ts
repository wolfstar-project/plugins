import {
  CloseCodes,
  DefaultWebSocketManagerOptions,
  WebSocketManager,
  WebSocketShardEvents,
  WebSocketShardStatus,
  type OptionalWebSocketManagerOptions,
  type SessionInfo,
  type ShardRange,
} from "@discordjs/ws";
import { Client as DiscordCoreClient, type API } from "@discordjs/core";
import type { REST } from "@discordjs/rest";
import { Client, container, type ClientOptions } from "@wolfstar/http-framework";
import {
  applyGatewayDispatch,
  createCache,
  isIterableCache,
  MemoryEntityCache,
  type Awaitable,
  type Cache as EntityCaches,
  type CacheEntityName,
  type CacheFactory,
  type CachePolicies,
  type EntityCache,
  type GatewaySessionStore,
} from "@wolfstar/plugin-cache";
import {
  GatewayDispatchEvents,
  GatewayIntentBits,
  GatewayOpcodes,
  type APIVoiceRegion,
  type GatewayDispatchPayload,
  type GatewayReadyDispatchData,
} from "discord-api-types/v10";
import { ChannelManager } from "./managers/ChannelManager.js";
import { GuildManager } from "./managers/GuildManager.js";
import { GuildMemberManager } from "./managers/GuildMemberManager.js";
import { MessageManager } from "./managers/MessageManager.js";
import { RoleManager } from "./managers/RoleManager.js";
import { SoundboardSound } from "./structures/soundboards/SoundboardSound.js";
import { WebhookManager } from "./managers/WebhookManager.js";
import { GuildTemplateManager } from "./managers/GuildTemplateManager.js";
import { VoiceStateManager } from "./managers/VoiceStateManager.js";
import { PresenceManager } from "./managers/PresenceManager.js";
import { ThreadManager } from "./managers/ThreadManager.js";
import { ThreadMemberManager } from "./managers/ThreadMemberManager.js";
import { UserManager } from "./managers/UserManager.js";
import type { BaseInvite } from "./structures/invites/BaseInvite.js";
import type { ClientUser } from "./structures/users/ClientUser.js";
import { createInvite } from "./structures/invites/GroupDMInvite.js";
import { bindClient, kRelations, type StructureMixin } from "./structures/Structure.js";
import { Sticker } from "./structures/stickers/Sticker.js";
import type { Webhook } from "./structures/webhooks/Webhook.js";
import type { GuildTemplate } from "./structures/guilds/GuildTemplate.js";
import { Widget } from "./structures/guilds/Widget.js";
import { StickerPack } from "./structures/stickers/StickerPack.js";
import { ActionsManager } from "./actions/Action.js";
import { dispatchPartition, DispatchQueue, type DispatchQueueStats } from "./util/DispatchQueue.js";
import { resolveInviteCode } from "./util/DataResolver.js";
import { DispatchTimeoutError } from "./util/errors.js";
import type { GatewayClientMessageDefaults } from "./structures/messages/MessagePayload.js";
import type { Partials } from "./util/Partials.js";
import { GatewaySessionMirror } from "./util/sessions.js";
import { GatewayTypeError } from "./errors/GatewayError.js";
import {
  isPromiseLike,
  type Cache,
  type CacheConstructor,
  type StructureCreator,
} from "./util/cache.js";
import { CollectionCache } from "./util/CollectionCache.js";
import { EntityStoreCache } from "./util/EntityStoreCache.js";
import { ManagedEntityNames, managerOf, type ManagedEntityName } from "./util/entityManagers.js";
import type { CacheErrorContext } from "./util/events.js";
import { NullCache } from "./util/NullCache.js";
import { createStructureStoreAdapter } from "./util/StructureStoreAdapter.js";

export interface GatewayClientOptions extends ClientOptions, GatewayClientMessageDefaults {
  /**
   * The gateway intents to identify with, e.g. `GatewayIntentBits.Guilds | GatewayIntentBits.GuildMessages`.
   */
  intents: GatewayIntentBits | number;
  /**
   * The total number of shards across every process, `null` to use the amount recommended by Discord.
   *
   * @default null
   */
  shardCount?: number | null;
  /**
   * The IDs of the shards this client manages, `null` to manage all of them.
   *
   * @default null
   */
  shardIds?: number[] | ShardRange | null;
  /**
   * Builds the cache of each entity, the one its managers expose as `manager.cache`: the `cacheConstructor` of the
   * discord.js RFC #11426. The caches hold structure instances, which dispatches patch in place.
   *
   * @remarks
   * It cannot be combined with {@link GatewayClientOptions.cache} or {@link GatewayClientOptions.makeCache}, which
   * back the managers with raw `@wolfstar/plugin-cache` stores instead: passing both throws. `cache: null` disables
   * caching altogether.
   *
   * The structures of a cache of instances are built synchronously, so the caches their relations are read from
   * must be synchronous too.
   *
   * @default CollectionCache
   */
  cacheConstructor?: CacheConstructor;
  /**
   * A `@wolfstar/plugin-cache` cache (in memory or Redis) whose raw stores back the managers, instead of the
   * in-memory caches of instances built by {@link GatewayClientOptions.cacheConstructor}: structures are then built
   * on every read. `null` disables caching: the managers' `cache.get` always answer `undefined`, update events
   * receive `null` as their previous state, and `fetch` always hits the API.
   *
   * @remarks
   * Every entity cache is optional: an entity kind the cache does not hold is simply not cached, see
   * `createInMemoryCache`'s `entities` option.
   *
   * @default undefined
   */
  cache?: EntityCaches | null;
  /**
   * Creates the store of each entity kind, `null` or `undefined` not to cache it: the `CacheConstructor` of the
   * discord.js RFC #11426. Called once per entity kind when the client is constructed, and takes precedence over
   * {@link GatewayClientOptions.cache}.
   *
   * @example
   * ```typescript
   * import { MemoryEntityCache } from '@wolfstar/plugin-cache';
   *
   * // Cache guilds, channels, and roles only.
   * const client = new GatewayClient({
   *   intents,
   *   makeCache: (entity) => (['guilds', 'channels', 'roles'].includes(entity) ? new MemoryEntityCache() : null),
   * });
   * ```
   *
   * @default undefined
   */
  makeCache?: CacheFactory;
  /**
   * The policies deciding which entries get cached, and for how long, per entity kind, see `withPolicy`. They apply to
   * every write, from dispatches as well as from the managers.
   *
   * @example
   * ```typescript
   * // Do not cache bots, and forget messages after an hour.
   * policies: { users: { filter: (user) => !user.bot }, messages: { ttl: () => 3_600_000 } }
   * ```
   *
   * @default undefined
   */
  policies?: CachePolicies;
  /**
   * What the managers do when a cache read or write fails, e.g. while Redis is unreachable. A `cacheError` event is
   * emitted either way.
   *
   * - `"miss"`: treat it as a cache miss, falling back to the API or to the data at hand.
   * - `"throw"`: reject with the error.
   *
   * @remarks
   * Dispatches follow {@link GatewayClientOptions.cacheFailure} instead.
   *
   * @default "miss"
   */
  cacheErrors?: "miss" | "throw";
  /**
   * Additional options for the underlying `@discordjs/ws` `WebSocketManager`, e.g. `compression` or
   * `initialPresence`.
   */
  gateway?: Partial<Omit<OptionalWebSocketManagerOptions, "token" | "shardCount" | "shardIds">>;
  /**
   * Where to keep the shards' sessions, e.g. `createRedisSessionStore` from `@wolfstar/plugin-cache`, so a restarted
   * process resumes them instead of identifying again: no identify quota spent, the dispatches missed meanwhile
   * replayed, and no `GUILD_CREATE` burst. Pair it with a persistent cache, since a resumed session does not refill an
   * empty one. Use {@link GatewayClient.destroy}'s `resumable` option to keep the sessions on a graceful shutdown.
   *
   * @remarks
   * The store is read once per shard when it first connects, then mirrored in memory, and written in the background
   * on every sequence change, see {@link GatewayClientOptions.sessionStoreTimeout}. Its failures are reported as
   * `GatewaySessionStoreError`s through the `error` event and never stop a shard: a failed read identifies.
   *
   * It replaces `gateway.retrieveSessionInfo` and `gateway.updateSessionInfo`, passing either alongside it throws.
   *
   * @default undefined
   */
  sessionStore?: GatewaySessionStore;
  /**
   * The time, in milliseconds, after which a shard stops waiting for {@link GatewayClientOptions.sessionStore} to read
   * its session, and identifies instead. `null` waits forever.
   *
   * @default 5_000
   */
  sessionStoreTimeout?: number | null;
  /**
   * What to do with a dispatch whose cache read or write fails, e.g. while Redis is unreachable. The error is always
   * reported through the `error` event (or the logger when nobody listens to it).
   *
   * - `"skip"`: drop the dispatch's event, so listeners never see state the cache does not hold.
   * - `"emitUncached"`: still emit the event, built from the payload alone, with `null` as the previous state.
   *
   * @default "skip"
   */
  cacheFailure?: "skip" | "emitUncached";
  /**
   * The time, in milliseconds, after which a dispatch still being processed is reported as a `DispatchTimeoutError`
   * through the `error` event. The dispatch is not cancelled. `null` disables the check.
   *
   * @default 30_000
   */
  dispatchTimeout?: number | null;
  /**
   * The structures to build partially when an event concerns one that is not cached, like discord.js's `partials`,
   * e.g. `[Partials.Message, Partials.User]`. See {@link Partials}.
   *
   * @default []
   */
  partials?: readonly Partials[];
  /**
   * How long, in milliseconds, the client waits for every guild `READY` listed as initially unavailable to become
   * available (its `GUILD_CREATE`) before emitting `clientReady` anyway, like discord.js's `waitGuildTimeout`.
   *
   * @remarks
   * It only bounds the wait on guild availability: `clientReady` still never fires before every shard this client
   * manages has connected, however long that takes, even past this timeout.
   *
   * Skipped (waits `0` ms) when `intents` does not include `GatewayIntentBits.Guilds`, since without it Discord never
   * sends the guilds' data, so no `GUILD_CREATE` for them ever arrives.
   *
   * @default 15_000
   */
  waitGuildTimeout?: number;
}

/** Options for loading pieces and starting both transports. */
export interface GatewayClientStartOptions {
  /** HTTP interaction server options. */
  listen: Client.ServerListenOptions;
  /** Piece loading options. */
  load?: Client.PieceLoadOptions;
}

/** Options for disconnecting the gateway shards. */
export interface GatewayClientDestroyOptions {
  /**
   * Whether to keep the shards' sessions resumable, for the next process to resume them (e.g. during a deploy): the
   * shards close with a code Discord does not invalidate the session on, and their sessions stay stored. Only
   * meaningful with {@link GatewayClientOptions.sessionStore}, or with `gateway.updateSessionInfo`.
   *
   * @default false
   */
  resumable?: boolean;
}

/**
 * A {@link Client} that, on top of serving HTTP interactions, connects to the Discord gateway, writes every dispatch
 * into its cache, and emits {@link GatewayEventMap} events carrying structures.
 *
 * @example
 * ```typescript
 * import { GatewayClient } from '@wolfstar/plugin-gateway';
 * import { createInMemoryCache } from '@wolfstar/plugin-cache';
 * import { GatewayIntentBits } from 'discord-api-types/v10';
 *
 * const client = new GatewayClient({
 *   intents: GatewayIntentBits.Guilds | GatewayIntentBits.GuildMessages,
 *   cache: createInMemoryCache(),
 * });
 *
 * client.on('messageCreate', (message) => console.log(`${message.author.username}: ${message.content}`));
 *
 * await client.start({ listen: { port: 8080 } });
 * ```
 */
export class GatewayClient extends Client {
  /**
   * The raw cache every dispatch is written into, if any: the `@wolfstar/plugin-cache` cache passed as
   * {@link GatewayClientOptions.cache}, or a raw view of the managers' caches of instances.
   */
  public readonly cache: EntityCaches | undefined;

  /**
   * The REST manager the gateway (for its gateway bot info) and every manager's API calls go through, like
   * discord.js's `Client#rest`.
   */
  public readonly rest: REST;

  /**
   * The underlying `@discordjs/ws` manager, handling the shards' connections, resumes, and identify rate limits.
   */
  public readonly gateway: WebSocketManager;

  /**
   * The typed REST API every manager's calls go through, `@discordjs/core`'s `API` built from {@link GatewayClient.rest}.
   */
  public readonly api: API;

  /**
   * The discord.js core client, sharing this client's REST and gateway transports, like the RFC `next` `Client`'s
   * own `core`.
   *
   * @remarks
   * Kept protected: managers and structures reach its typed REST calls through {@link GatewayClient.api} instead, and
   * its gateway and REST manager are already {@link GatewayClient.gateway} and {@link GatewayClient.rest}. It is only
   * needed to build the discord.js core client's own event listeners, if this class ever wraps them.
   */
  protected readonly core: DiscordCoreClient;

  /** The actions that turn gateway dispatches into public client events. */
  public readonly actions: ActionsManager;

  /**
   * The bot user, set once the first shard receives `READY`.
   */
  public user: ClientUser | null = null;

  public readonly users: UserManager;
  public readonly guilds: GuildManager;
  public readonly channels: ChannelManager;
  public readonly threads: ThreadManager;
  public readonly threadMembers: ThreadMemberManager;
  public readonly messages: MessageManager;
  public readonly members: GuildMemberManager;
  public readonly roles: RoleManager;
  public readonly webhooks: WebhookManager;
  public readonly templates: GuildTemplateManager;
  public readonly voiceStates: VoiceStateManager;
  public readonly presences: PresenceManager;

  /**
   * What happens to a dispatch whose cache read or write fails, see {@link GatewayClientOptions.cacheFailure}.
   */
  public readonly cacheFailure: "skip" | "emitUncached";

  /**
   * What the managers do when a cache read or write fails, see {@link GatewayClientOptions.cacheErrors}.
   */
  public readonly cacheErrors: "miss" | "throw";

  /**
   * See {@link GatewayClientOptions.dispatchTimeout}.
   */
  public readonly dispatchTimeout: number | null;

  /**
   * The structures built partially for uncached entities, see {@link GatewayClientOptions.partials}.
   */
  public readonly partials: readonly Partials[];

  /**
   * See {@link GatewayClientOptions.waitGuildTimeout}.
   */
  public readonly waitGuildTimeout: number;

  /**
   * The timestamp the client last became ready, like discord.js's `Client#readyTimestamp`. `null` until
   * `clientReady` is first emitted, see {@link GatewayClient.clientReadyAt}.
   */
  public clientReadyTimestamp: number | null = null;

  // Dispatches of a guild are processed in order, so an asynchronous cache never reorders them, while different
  // guilds proceed concurrently.
  readonly #queue = new DispatchQueue();

  // One cache per entity, shared by every manager of that entity.
  readonly #caches = new Map<CacheEntityName, Cache<any>>();

  // `null` when the managers view plugin-cache stores (or nothing) instead of caches built by a constructor.
  readonly #cacheConstructor: CacheConstructor | null;

  // The plugin-cache stores backing the managers, `undefined` with caches built by a constructor or without cache.
  readonly #stores: EntityCaches | undefined;

  readonly #shardCount: number | null;

  readonly #intents: number;

  // Resolved once from the options (or the environment) and kept private, rather than read again from `this.options`,
  // which the base client scrubs it from.
  readonly #token: string;

  // The guilds `READY` listed as initially unavailable, whose `GUILD_CREATE` or `GUILD_DELETE` the client waits for
  // before emitting `clientReady`, like discord.js's `Client#expectedGuilds`.
  readonly #expectedGuilds = new Set<string>();

  // The fallback timer emitting `clientReady` even with guilds still unavailable, like discord.js's own
  // `readyTimeout`. Cleared and rescheduled every time `#checkClientReady` runs short of triggering it.
  #clientReadyTimer: ReturnType<typeof setTimeout> | null = null;

  #sessions: GatewaySessionMirror | null = null;

  // Set while a resumable `destroy` runs, see `sessionCallbacks`.
  #keepSessions = false;

  // The `destroy` in progress, which a concurrent call joins instead of changing `#keepSessions` under it.
  #destroying: Promise<void> | null = null;

  public constructor(options: GatewayClientOptions) {
    super(options);
    container.gatewayClient = this;

    // Set by the base client's constructor, which validated the token and built the REST manager already.
    this.rest = container.rest;
    // Asking for plugin-cache stores rules the caches of instances out, even when no entity ends up stored.
    const storeBacked = Boolean(options.cache || options.makeCache);
    if (options.cacheConstructor && storeBacked) throw new GatewayTypeError("ClientCacheConflict");
    const stores = resolveCache(options);
    this.#stores = stores;
    this.#cacheConstructor =
      options.cache === null || storeBacked ? null : (options.cacheConstructor ?? CollectionCache);
    this.cacheErrors = options.cacheErrors ?? "miss";
    this.cacheFailure = options.cacheFailure ?? "skip";
    this.dispatchTimeout = options.dispatchTimeout === undefined ? 30_000 : options.dispatchTimeout;
    this.partials = Object.freeze([...(options.partials ?? [])]);
    this.waitGuildTimeout = options.waitGuildTimeout ?? 15_000;
    this.#shardCount = options.shardCount ?? null;
    this.#intents = Number(options.intents);
    // The base client validated it already, and scrubs it from `this.options`.
    this.#token = (options.discordToken ?? process.env.DISCORD_TOKEN)!;
    this.users = new UserManager(this);
    this.guilds = new GuildManager(this);
    this.channels = new ChannelManager(this);
    this.threads = new ThreadManager(this);
    this.threadMembers = new ThreadMemberManager(this);
    this.messages = new MessageManager(this);
    this.members = new GuildMemberManager(this);
    this.roles = new RoleManager(this);
    this.webhooks = new WebhookManager(this);
    this.templates = new GuildTemplateManager(this);
    this.voiceStates = new VoiceStateManager(this);
    this.presences = new PresenceManager(this);
    this.cache = this.#cacheConstructor ? this.#createStructureStores(options.policies) : stores;

    this.gateway = new WebSocketManager({
      ...options.gateway,
      ...this.sessionCallbacks(options),
      token: this.#token,
      intents: options.intents as GatewayIntentBits,
      rest: this.rest,
      shardCount: options.shardCount ?? null,
      shardIds: options.shardIds ?? null,
    });
    this.core = new DiscordCoreClient({ gateway: this.gateway, rest: this.rest });
    this.api = this.core.api;
    this.actions = new ActionsManager(this);

    this.gateway.on(WebSocketShardEvents.Dispatch, (payload, shardId) => {
      const partition = dispatchPartition(payload);
      void this.#queue.enqueue(shardId, partition, () =>
        this.runDispatch(payload, shardId, partition),
      );
    });
    this.gateway.on(WebSocketShardEvents.Resumed, (shardId) => this.emit("shardResume", shardId));
    this.gateway.on(WebSocketShardEvents.Closed, (code, shardId) =>
      this.emit("shardClose", shardId, code),
    );
    this.gateway.on(WebSocketShardEvents.Error, (error, shardId) =>
      this.emit("shardError", error, shardId),
    );
    this.gateway.on(WebSocketShardEvents.Debug, (message, shardId) =>
      this.logger.debug(`[Gateway] [Shard ${shardId}] ${message}`),
    );
  }

  /**
   * Connects every configured shard to the gateway.
   */
  public async connect(): Promise<void> {
    await this.gateway.connect();
  }

  /** Loads pieces, starts the interaction endpoint, then connects gateway shards. */
  public async start({ listen, load }: GatewayClientStartOptions): Promise<void> {
    await this.load(load);
    await this.listen(listen);
    await this.connect();
  }

  /**
   * Disconnects every shard from the gateway. The HTTP server, if listening, is left untouched.
   *
   * @remarks
   * By default, the shards close their sessions, which Discord invalidates. Pass `resumable: true` to keep them
   * resumable instead, e.g. on a graceful shutdown before a deploy. Either way, it waits for the sessions to be
   * written to {@link GatewayClientOptions.sessionStore}.
   *
   * A call made while another one is still disconnecting the shards joins it, keeping the first call's `resumable`.
   *
   * @param options Whether to keep the sessions resumable.
   */
  public destroy(options: GatewayClientDestroyOptions = {}): Promise<void> {
    this.#destroying ??= this.disconnect(options.resumable ?? false).finally(() => {
      this.#destroying = null;
    });
    return this.#destroying;
  }

  private async disconnect(resumable: boolean): Promise<void> {
    this.#keepSessions = resumable;
    try {
      // Discord invalidates the session of a connection closed with 1000 or 1001, the default is 1000.
      await this.gateway.destroy(
        this.#keepSessions ? { code: CloseCodes.Resuming, reason: "Resumable shutdown" } : {},
      );
    } finally {
      this.#keepSessions = false;
    }

    await this.#sessions?.flush();
    await this.idle();
  }

  /**
   * Runs a cache write of the client's own (e.g. after leaving a guild) in order with the guild's dispatches.
   *
   * @param guildId The ID of the guild.
   * @param task The cache write.
   * @internal
   */
  public async runInGuildOrder<Value>(guildId: string, task: () => Promise<Value>): Promise<Value> {
    let outcome: { value: Value } | { error: unknown } | undefined;
    // Queued tasks must never reject: the outcome is carried out of the queue instead.
    await this.#queue.enqueueGuild(guildId, async () => {
      try {
        outcome = { value: await task() };
      } catch (error) {
        outcome = { error };
      }
    });

    if ("error" in outcome!) throw outcome.error;
    return outcome!.value;
  }

  /**
   * Gets the cache of an entity, building it on first use: the `CacheConstructor` of the discord.js RFC #11426.
   * Every manager of the same entity shares the same cache.
   *
   * @param creator Builds a structure from raw data, for entities the client does not know how to build.
   * @param name The name of the entity.
   */
  public CacheConstructor<Value extends StructureMixin<object>>(
    creator: StructureCreator<Value>,
    name: CacheEntityName,
  ): Cache<Value> {
    let cache = this.#caches.get(name);
    if (cache === undefined) {
      cache = this.#createCache(creator, name);
      this.#caches.set(name, cache);
    }

    return cache as Cache<Value>;
  }

  /**
   * Runs a raw store operation, reporting its failure through `cacheError`, see
   * {@link GatewayClientOptions.cacheErrors}. Synchronous when the operation is.
   *
   * @internal
   */
  public guardCache<T>(
    entity: CacheEntityName,
    operation: CacheErrorContext["operation"],
    key: string | null,
    run: () => Awaitable<T>,
    fallback: T,
  ): Awaitable<T> {
    const fail = (error: unknown): T => {
      this.emit("cacheError", error, { entity, key, operation });
      if (this.cacheErrors === "throw") throw error;
      return fallback;
    };

    try {
      const result = run();
      return isPromiseLike(result) ? result.catch(fail) : result;
    } catch (error) {
      return fail(error);
    }
  }

  #createCache(creator: StructureCreator<any>, name: CacheEntityName): Cache<any> {
    const managed = (ManagedEntityNames as readonly string[]).includes(name);
    // Managed entities are built by their manager, whoever asked for the cache first: `construct` wraps the data
    // alone, synchronously, while `hydrate` also resolves the relations, from caches that may be asynchronous.
    const construct: StructureCreator<any> = managed
      ? (data) => managerOf(this, name as ManagedEntityName, data)._construct(data)
      : creator;
    const hydrate: (data: object) => Awaitable<StructureMixin<object>> = managed
      ? (data) => managerOf(this, name as ManagedEntityName, data)._build(data)
      : creator;
    const keyOf = managed
      ? (data: object) => managerOf(this, name as ManagedEntityName, data).keyOf(data)
      : (data: object) => (data as { id: string }).id;

    if (this.#cacheConstructor) {
      // Re-resolves the relations of a long-lived instance, which would otherwise keep the ones of the day it was
      // built: a member's voice state would not follow `VOICE_STATE_UPDATE`.
      const refresh = (value: StructureMixin<object>) => {
        const fresh = hydrate((value as unknown as { toJSON(): object }).toJSON());
        if (isPromiseLike(fresh)) {
          // Nothing awaits the promise, so its rejection must not go unhandled.
          fresh.catch(() => undefined);
          throw new GatewayTypeError("CacheConstructorAsynchronous", name);
        }

        value[kRelations] = fresh[kRelations];
        return value;
      };
      return new this.#cacheConstructor(construct, name, { keyOf, refresh });
    }

    const store = this.#stores?.[name] as EntityCache<any> | undefined;
    if (store === undefined) return new NullCache(construct, name);
    return new EntityStoreCache(construct, name, {
      store,
      keyOf,
      hydrate,
      guard: (operation, key, run, fallback) =>
        this.guardCache(name, operation, key, run, fallback),
    });
  }

  // The raw view of the structure caches, which dispatches are written into.
  #createStructureStores(policies: CachePolicies | undefined): EntityCaches {
    return createCache({
      policies,
      makeCache: (name) =>
        (ManagedEntityNames as readonly string[]).includes(name)
          ? createStructureStoreAdapter(this.CacheConstructor(() => undefined as never, name))
          : new MemoryEntityCache(),
    });
  }

  /**
   * Resolves once every dispatch received so far has been processed.
   */
  public async idle(): Promise<void> {
    await this.#queue.idle();
  }

  /**
   * Fetches Discord's default soundboard sounds, which every guild can play.
   */
  public async fetchDefaultSoundboardSounds(): Promise<SoundboardSound[]> {
    const sounds = await this.api.soundboardSounds.getSoundboardDefaultSounds();
    return sounds.map((sound) => new SoundboardSound(sound));
  }

  /**
   * Fetches a webhook. discord.js: `client.fetchWebhook(id, token)`.
   *
   * @param webhookId The ID of the webhook.
   * @param token The webhook's token, to fetch it without the bot's authorization.
   */
  public fetchWebhook(webhookId: string, token?: string): Promise<Webhook> {
    return this.webhooks.fetch(webhookId, token);
  }

  /**
   * Fetches a guild template by its code. discord.js: `client.fetchGuildTemplate(code)`.
   *
   * @param code The code of the template, or its URL.
   */
  public fetchGuildTemplate(code: string): Promise<GuildTemplate> {
    return this.templates.fetch(code);
  }

  /**
   * Fetches the public widget of a guild, which must be enabled. Needs no membership of the guild.
   *
   * @param guildId The ID of the guild.
   */
  public async fetchGuildWidget(guildId: string): Promise<Widget> {
    return new Widget(await this.api.guilds.getWidget(guildId));
  }

  /**
   * Fetches an invite by its code.
   *
   * @param code The code of the invite, or its URL.
   * @param options Whether to include the approximate counts (default), and a scheduled event to attach.
   */
  public async fetchInvite(
    code: string,
    options: { withCounts?: boolean; guildScheduledEventId?: string } = {},
  ): Promise<BaseInvite> {
    const invite = await this.api.invites.get(resolveInviteCode(code), {
      with_counts: options.withCounts ?? true,
      guild_scheduled_event_id: options.guildScheduledEventId,
    });
    const [guild, channel, inviter, targetUser] = await Promise.all([
      invite.guild ? this.guilds.cache.get(invite.guild.id) : undefined,
      invite.channel ? this.channels.cache.get(invite.channel.id) : undefined,
      invite.inviter ? this.users._resolveData(invite.inviter) : undefined,
      invite.target_user ? this.users._resolveData(invite.target_user) : undefined,
    ]);
    return bindClient(
      createInvite(invite, { guild: guild ?? null, channel: channel ?? null, inviter, targetUser }),
      this,
    );
  }

  /**
   * Fetches a sticker, standard or from a guild.
   *
   * @param stickerId The ID of the sticker.
   */
  public async fetchSticker(stickerId: string): Promise<Sticker> {
    return new Sticker(await this.api.stickers.get(stickerId));
  }

  /**
   * Fetches the packs of standard stickers.
   */
  public async fetchStickerPacks(): Promise<StickerPack[]> {
    const { sticker_packs: packs } = await this.api.stickers.getStickers();
    return packs.map((pack) => new StickerPack(pack));
  }

  /**
   * Fetches the voice regions available to the bot.
   */
  public async fetchVoiceRegions(): Promise<APIVoiceRegion[]> {
    return this.api.voice.getVoiceRegions();
  }

  /**
   * The dispatches received but not processed yet, and the partitions (guilds, direct message channels) they are
   * queued in. A growing `pending` count usually means a slow or unreachable cache.
   */
  public get queueStats(): DispatchQueueStats {
    return this.#queue.stats;
  }

  /**
   * The time the client last became ready, like discord.js's `Client#readyAt`. `null` until `clientReady` is first
   * emitted.
   */
  public get clientReadyAt(): Date | null {
    return this.clientReadyTimestamp === null ? null : new Date(this.clientReadyTimestamp);
  }

  /**
   * Whether the client already emitted `clientReady`, like discord.js's `Client#isReady()`.
   */
  public isClientReady(): boolean {
    return this.clientReadyTimestamp !== null;
  }

  /**
   * Processes a gateway dispatch: emits it as `raw`, writes it into the cache, emits it as `dispatch`, and emits the
   * matching {@link GatewayEventMap} event, if any.
   *
   * @param payload The dispatch payload.
   * @param shardId The ID of the shard that received it.
   */
  protected async handleDispatch(payload: GatewayDispatchPayload, shardId: number): Promise<void> {
    this.emit("raw", payload, shardId);

    // Interactions are served by the HTTP endpoint, see the `DispatchHandlers` remarks.
    if (payload.t === GatewayDispatchEvents.InteractionCreate) return;
    // A rate limited members request gets no chunks: fail it now rather than at its timeout.
    if (payload.t === GatewayDispatchEvents.RateLimited) this.members.handleRateLimited(payload.d);

    const action = this.actions.get(payload.t);
    // `READY` is never dropped: it sets `client.user` and `shardReady` from the payload alone, and a shard without it
    // looks dead to the bot. Reconciling the cache with it is best effort, see `reconcileGuilds`.
    const isReady = payload.t === GatewayDispatchEvents.Ready;
    if (isReady) {
      await this.reconcileGuilds(payload.d, shardId);
      // The guilds this shard's `READY` listed as initially unavailable, awaited by `clientReady`.
      for (const guild of payload.d.guilds) this.#expectedGuilds.add(guild.id);
    }

    let state: unknown;
    try {
      state = await action?.before(payload.d);
      if (this.cache) {
        await applyGatewayDispatch(this.cache, payload, { clientUserId: this.user?.id ?? this.id });
      }
    } catch (error) {
      if (this.cacheFailure === "skip" && !isReady) throw error;
      this.reportError(error, payload.t, shardId);
      state = undefined;
    }

    this.emit("dispatch", payload, shardId);
    await action?.handle(payload.d, state, shardId);

    if (this.clientReadyTimestamp === null) {
      if (isReady) {
        await this.#checkClientReady();
      } else if (
        (payload.t === GatewayDispatchEvents.GuildCreate ||
          payload.t === GatewayDispatchEvents.GuildDelete) &&
        this.#expectedGuilds.delete(payload.d.id)
      ) {
        await this.#checkClientReady();
      }
    }
  }

  /**
   * Emits `clientReady` once every shard this client manages has connected and every guild `READY` listed as
   * initially unavailable became available, or {@link GatewayClientOptions.waitGuildTimeout} elapses, like
   * discord.js's `Client#_checkReady`.
   *
   * @remarks
   * `waitGuildTimeout` bounds the wait on guild availability only: once it elapses, the still-unavailable guilds are
   * forgotten (so a later `GUILD_CREATE`/`GUILD_DELETE` for one of them does not spuriously re-run this), but every
   * shard connecting is never skipped, however long that takes — there is no such timeout for it, matching
   * `@discordjs/ws`, which waits for the network rather than giving up.
   *
   * Unlike discord.js, `clientReady` only ever fires once: subsequent guild or shard activity does not re-trigger it.
   */
  async #checkClientReady(): Promise<void> {
    // A concurrent shard's call already triggered it.
    if (this.clientReadyTimestamp !== null) return;

    if (this.#clientReadyTimer) {
      clearTimeout(this.#clientReadyTimer);
      this.#clientReadyTimer = null;
    }

    if (this.#expectedGuilds.size > 0) {
      // Without the `Guilds` intent, Discord never sends the unavailable guilds' data, so no `GUILD_CREATE` for them
      // ever arrives: there is nothing to wait for.
      const hasGuildsIntent = (this.#intents & GatewayIntentBits.Guilds) !== 0;
      this.#clientReadyTimer = setTimeout(
        () => {
          this.#clientReadyTimer = null;
          this.#expectedGuilds.clear();
          void this.#checkClientReady();
        },
        hasGuildsIntent ? this.waitGuildTimeout : 0,
      );
      this.#clientReadyTimer.unref?.();
      return;
    }

    const statuses = await this.gateway.fetchStatus();
    // Re-check: a concurrent call may have triggered it, or a shard may have disconnected, while this one awaited
    // the shards' statuses.
    if (this.clientReadyTimestamp !== null || this.#expectedGuilds.size > 0) return;

    const everyShardReady = [...statuses.values()].every(
      (status) => status === WebSocketShardStatus.Ready,
    );
    if (everyShardReady) this.#triggerClientReady();
    // Otherwise, nothing left to bound with a timer: the next shard to connect re-enters here through its own
    // `READY`.
  }

  // Sets `clientReadyTimestamp` and emits `clientReady`, guarding against a concurrent call (a racing shard, or the
  // fallback timer) doing it first: this is always called synchronously, with no `await` before it, so the guard
  // cannot itself be raced.
  #triggerClientReady(): void {
    if (this.clientReadyTimestamp !== null) return;
    this.clientReadyTimestamp = Date.now();
    this.emit("clientReady", this);
  }

  /**
   * Drops the cached guilds of a shard its `READY` no longer lists, and emits `guildDelete` for each of them.
   *
   * @remarks
   * They are the guilds the bot left while it was disconnected, or while the process was down with a persistent
   * cache. Discord does not replay those removals on a new session, so the cache would otherwise keep them forever.
   *
   * It needs a guilds cache able to enumerate its entries, and is skipped without one.
   *
   * It is best effort: any failure (cache unreachable, unknown shard count) is reported through `error` and stops the
   * reconciliation, keeping the remaining guilds, but never fails `READY` itself.
   *
   * @param data The `READY` data.
   * @param shardId The shard that received it.
   */
  protected async reconcileGuilds(data: GatewayReadyDispatchData, shardId: number): Promise<void> {
    try {
      await this.dropUnlistedGuilds(data, shardId);
    } catch (error) {
      this.reportError(error, GatewayDispatchEvents.Ready, shardId);
    }
  }

  private async dropUnlistedGuilds(data: GatewayReadyDispatchData, shardId: number): Promise<void> {
    // Telling the guilds the bot left apart takes the list of the cached ones.
    const { cache } = this;
    const guilds = cache?.guilds;
    if (!cache || !guilds || !isIterableCache(guilds)) return;

    const cached = await guilds.keys();
    if (cached.length === 0) return;

    // Without the shard count, the guilds of this shard cannot be told apart from the others'.
    const count = data.shard?.[1] ?? this.#shardCount ?? (await this.gateway.getShardCount());
    const listed = new Set(data.guilds.map((guild) => guild.id));
    const shardCount = BigInt(count);
    for (const id of cached) {
      if (listed.has(id) || Number((BigInt(id) >> 22n) % shardCount) !== shardId) continue;

      const guild = (await this.guilds.cache.get(id)) ?? null;
      await applyGatewayDispatch(cache, {
        op: GatewayOpcodes.Dispatch,
        s: 0,
        t: GatewayDispatchEvents.GuildDelete,
        d: { id },
      });
      this.emit("guildDelete", guild, { id });
    }
  }

  private async runDispatch(
    payload: GatewayDispatchPayload,
    shardId: number,
    partition: string | null,
  ): Promise<void> {
    const timeout = this.dispatchTimeout;
    const timer =
      timeout === null
        ? null
        : setTimeout(() => {
            this.reportError(
              new DispatchTimeoutError(payload.t, shardId, partition, timeout),
              payload.t,
              shardId,
            );
          }, timeout);
    timer?.unref?.();

    try {
      await this.handleDispatch(payload, shardId);
    } catch (error) {
      this.reportError(error, payload.t, shardId);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private sessionCallbacks(
    options: GatewayClientOptions,
  ): Pick<OptionalWebSocketManagerOptions, "retrieveSessionInfo" | "updateSessionInfo"> {
    const { sessionStore, gateway } = options;
    if (sessionStore && (gateway?.retrieveSessionInfo || gateway?.updateSessionInfo)) {
      throw new GatewayTypeError("ClientSessionStoreConflict");
    }

    let retrieve =
      gateway?.retrieveSessionInfo ?? DefaultWebSocketManagerOptions.retrieveSessionInfo;
    let update = gateway?.updateSessionInfo ?? DefaultWebSocketManagerOptions.updateSessionInfo;
    if (sessionStore) {
      const timeout =
        options.sessionStoreTimeout === undefined ? 5_000 : options.sessionStoreTimeout;
      const sessions = new GatewaySessionMirror(sessionStore, timeout, (error) =>
        this.reportError(error, `the session store ${error.operation}`, error.shardId),
      );
      this.#sessions = sessions;
      // Both directions keep `GatewaySessionInfo` assignable to and from `@discordjs/ws`'s `SessionInfo`.
      retrieve = (shardId): Promise<SessionInfo | null> => sessions.get(shardId);
      update = (shardId, info) => sessions.set(shardId, info);
    }

    return {
      retrieveSessionInfo: retrieve,
      // `@discordjs/ws` drops the session of every shard destroyed without resuming, a resumable shutdown included:
      // the session must stay stored for the next process to resume it.
      updateSessionInfo: (shardId, info) =>
        info === null && this.#keepSessions ? undefined : update(shardId, info),
    };
  }

  // Emitting "error" without listeners throws, which would reject the queue and stall the partition.
  private reportError(error: unknown, type: string, shardId: number): void {
    if (this.listenerCount("error") > 0) this.emit("error", error);
    else this.logger.error(`[Gateway] [Shard ${shardId}] Failed to process ${type}:`, error);
  }
}

/**
 * Builds the raw stores of a client out of its options: the stores of `makeCache` (or `cache`), wrapped by
 * `policies`. `undefined` when no entity kind is stored, which `cache: null` asks for.
 */
function resolveCache(options: GatewayClientOptions): EntityCaches | undefined {
  const { makeCache, cache, policies } = options;
  const source: CacheFactory | undefined =
    makeCache ?? (cache ? (entity) => cache[entity] : undefined);
  if (!source) return undefined;

  const resolved =
    source === makeCache || policies ? createCache({ makeCache: source, policies }) : cache!;
  return Object.keys(resolved).length === 0 ? undefined : resolved;
}
