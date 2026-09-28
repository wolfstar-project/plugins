import type {
  APIAuditLogEntry,
  APIAutoModerationRule,
  APIChannel,
  APIEmoji,
  APIEntitlement,
  APIGuild,
  APIGuildMember,
  APIGuildScheduledEvent,
  APIRole,
  APISoundboardSound,
  APIStageInstance,
  APISticker,
  APISubscription,
  APIThreadChannel,
  APIThreadMember,
  APIUser,
  APIVoiceState,
  GatewayApplicationCommandPermissionsUpdateDispatchData,
  GatewayGuildBanModifyDispatchData,
  GatewayGuildCreateDispatchData,
  GatewayIntegrationCreateDispatchData,
  GatewayIntegrationUpdateDispatchData,
  GatewayInviteCreateDispatchData,
  GatewayMessageCreateDispatchData,
  GatewayMessageUpdateDispatchData,
  GatewayPresenceUpdateDispatchData,
  Snowflake,
} from "discord-api-types/v10";

/**
 * A value that may or may not be wrapped in a promise.
 */
export type Awaitable<T> = T | Promise<T>;

/**
 * The raw, JSON-serializable shape stored for every entity kind.
 *
 * @remarks
 * The cache never stores `Structure` instances, only the raw API payloads (merged in place for partial updates).
 * Building structures on top of them is the job of the consumer, e.g. `@wolfstar/plugin-gateway`'s managers.
 */
export interface CacheEntityTypes {
  applicationCommandPermissions: GatewayApplicationCommandPermissionsUpdateDispatchData;
  auditLogEntries: APIAuditLogEntry & { guild_id: Snowflake };
  autoModerationRules: APIAutoModerationRule;
  bans: GatewayGuildBanModifyDispatchData;
  channels: APIChannel & { guild_id?: Snowflake };
  emojis: APIEmoji & { guild_id: Snowflake };
  entitlements: APIEntitlement;
  /**
   * A guild without its collections (`roles`, `emojis`, `stickers`, `channels`, `members`, ...): they are stored in
   * their own entity caches, which stay up to date as the guild changes.
   */
  guilds: Omit<APIGuild, "emojis" | "roles" | "stickers"> &
    Partial<Omit<GatewayGuildCreateDispatchData, keyof APIGuild>>;
  integrations: GatewayIntegrationCreateDispatchData | GatewayIntegrationUpdateDispatchData;
  invites: GatewayInviteCreateDispatchData;
  members: APIGuildMember & { guild_id: Snowflake };
  messages: GatewayMessageCreateDispatchData | GatewayMessageUpdateDispatchData;
  presences: GatewayPresenceUpdateDispatchData;
  roles: APIRole & { guild_id: Snowflake };
  scheduledEvents: APIGuildScheduledEvent;
  soundboardSounds: APISoundboardSound;
  stageInstances: APIStageInstance;
  stickers: APISticker & { guild_id: Snowflake };
  subscriptions: APISubscription;
  threadMembers: APIThreadMember & { guild_id?: Snowflake };
  threads: APIThreadChannel;
  users: APIUser;
  voiceStates: APIVoiceState;
}

/**
 * The name of any of the entity caches held by a {@link Cache}.
 */
export type CacheEntityName = keyof CacheEntityTypes;

/**
 * The options of {@link EntityCache.set}.
 */
export interface CacheSetOptions {
  /**
   * How long the entry lives, in milliseconds, overriding the store's default time-to-live. `null` keeps the entry
   * until it is deleted or evicted, and `undefined` uses the store's default.
   */
  ttl?: number | null;
}

/**
 * The options of {@link EntityCache.upsert}.
 */
export interface CacheUpsertOptions extends CacheSetOptions {
  /**
   * Whether to replace the cached entry with the data, rather than shallowly merging the data into it.
   *
   * @default false
   */
  overwrite?: boolean;
}

/**
 * What {@link EntityCache.upsert} resolves to.
 */
export interface CacheUpsertResult<Raw> {
  /**
   * The entry before the upsert, `undefined` when it was not cached.
   */
  existing?: Raw;
  /**
   * The entry after the upsert, returned even when the store (or its policy) did not keep it.
   */
  added: Raw;
}

/**
 * A Map-like, per-entity key-value store, the `Cache` interface of the discord.js RFC #11426.
 *
 * @remarks
 * Every method returns an {@link Awaitable}, so synchronous (in-memory) and asynchronous (Redis) stores implement the
 * exact same contract. Enumerating the entries is an optional extension, see {@link IterableEntityCache}: a remote
 * store may not be able to do it cheaply.
 */
export interface EntityCache<Raw> {
  /**
   * Whether every method returns its result synchronously, never a promise. Optional: a cache without it is treated
   * as asynchronous, which is always safe.
   *
   * @remarks
   * An {@link Awaitable} cannot be told apart from a promise without calling the method, so this is how consumers
   * know they can read the cache without awaiting it, e.g. `@wolfstar/plugin-gateway`'s `cached` accessors.
   */
  readonly synchronous?: boolean;
  get(key: string): Awaitable<Raw | undefined>;
  set(key: string, value: Raw, options?: CacheSetOptions): Awaitable<void>;
  /**
   * Adds data to the cache, shallowly merging it into the cached entry unless `overwrite` is set: the RFC's `add`.
   *
   * @param key The key of the entry.
   * @param data The data, stored as is when the key is not cached.
   * @param options Whether to overwrite the cached entry, and its time-to-live.
   * @returns The entry before and after the upsert.
   */
  upsert(
    key: string,
    data: Partial<Raw>,
    options?: CacheUpsertOptions,
  ): Awaitable<CacheUpsertResult<Raw>>;
  has(key: string): Awaitable<boolean>;
  delete(key: string): Awaitable<boolean>;
  clear(): Awaitable<void>;
  getSize(): Awaitable<number>;
  /**
   * Deletes every entry belonging to a guild through an index, rather than a scan of the whole cache. Optional:
   * {@link applyGatewayDispatch} falls back to a scan for caches without it.
   *
   * @param guildId The ID of the guild.
   * @returns The amount of deleted entries, or `null` when this cache does not index its entries by guild.
   */
  deleteGuild?(guildId: string): Awaitable<number | null>;
}

/**
 * An {@link EntityCache} that can enumerate its entries.
 *
 * @remarks
 * `keys`, `values`, and `entries` return snapshots rather than live iterators, which keeps the semantics identical
 * across backends. Features scanning a cache (`listCached`, the `GUILD_DELETE` cascade without a guild index) are
 * skipped for stores without them.
 */
export interface IterableEntityCache<Raw> extends EntityCache<Raw> {
  keys(): Awaitable<string[]>;
  values(): Awaitable<Raw[]>;
  entries(): Awaitable<[key: string, value: Raw][]>;
}

/**
 * Whether an {@link EntityCache} can enumerate its entries.
 *
 * @param cache The cache.
 */
export function isIterableCache<Raw>(cache: EntityCache<Raw>): cache is IterableEntityCache<Raw> {
  const iterable = cache as Partial<IterableEntityCache<Raw>>;
  return (
    typeof iterable.keys === "function" &&
    typeof iterable.values === "function" &&
    typeof iterable.entries === "function"
  );
}

/**
 * One optional {@link EntityCache} per entity kind: an entity without one is not cached.
 */
export type CacheEntities = {
  readonly [Name in CacheEntityName]?: EntityCache<CacheEntityTypes[Name]>;
};

/**
 * A storage-agnostic Discord cache: one {@link EntityCache} per cached entity kind, and nothing else.
 *
 * @remarks
 * The cache is intentionally dumb: it has no knowledge of the gateway nor of the relations between entities. Cascading
 * a gateway dispatch into every relevant entity cache (e.g. dropping a guild's channels on `GUILD_DELETE`) is done by
 * {@link applyGatewayDispatch}, which only relies on this interface, so any custom implementation gets it for free.
 *
 * Every entity cache is optional: leaving one out disables caching that entity kind, and an empty cache (or none at
 * all) is a fully supported configuration.
 */
export interface Cache extends CacheEntities {}

/**
 * Decides what gets cached, and for how long, entry by entry, see {@link withPolicy}.
 */
export interface CachePolicy<Raw> {
  /**
   * Whether to cache an entry. When it returns `false`, the entry is not written, and an entry already cached under
   * the same key is deleted, so the cache never serves outdated data.
   *
   * @param value The entry, merged with the cached one for upserts.
   * @param key The key of the entry.
   */
  filter?(value: Raw, key: string): boolean;
  /**
   * How long an entry lives, in milliseconds, or `null` for it to never expire.
   *
   * @param value The entry, merged with the cached one for upserts.
   * @param key The key of the entry.
   */
  ttl?(value: Raw, key: string): number | null;
}

/**
 * One optional {@link CachePolicy} per entity kind.
 */
export type CachePolicies = {
  [Name in CacheEntityName]?: CachePolicy<CacheEntityTypes[Name]>;
};

/**
 * Creates the store of an entity kind, or returns `null`/`undefined` not to cache it: the RFC's `CacheConstructor`.
 */
export type CacheFactory = (entity: CacheEntityName) => EntityCache<any> | null | undefined;
