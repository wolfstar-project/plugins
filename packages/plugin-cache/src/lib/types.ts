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
 * A Map-like, per-entity key-value store.
 *
 * @remarks
 * Every method returns an {@link Awaitable}, so synchronous (in-memory) and asynchronous (Redis) stores implement the
 * exact same contract. `keys`, `values`, and `entries` return snapshots rather than live iterators, which keeps the
 * semantics identical across backends.
 */
export interface EntityCache<Raw> {
  get(key: string): Awaitable<Raw | undefined>;
  set(key: string, value: Raw): Awaitable<void>;
  has(key: string): Awaitable<boolean>;
  delete(key: string): Awaitable<boolean>;
  clear(): Awaitable<void>;
  getSize(): Awaitable<number>;
  keys(): Awaitable<string[]>;
  values(): Awaitable<Raw[]>;
  entries(): Awaitable<[key: string, value: Raw][]>;
}

/**
 * One {@link EntityCache} per entity kind.
 */
export type CacheEntities = {
  readonly [Name in CacheEntityName]: EntityCache<CacheEntityTypes[Name]>;
};

/**
 * A storage-agnostic Discord cache: one {@link EntityCache} per entity kind, and nothing else.
 *
 * @remarks
 * The cache is intentionally dumb: it has no knowledge of the gateway nor of the relations between entities. Cascading
 * a gateway dispatch into every relevant entity cache (e.g. dropping a guild's channels on `GUILD_DELETE`) is done by
 * {@link applyGatewayDispatch}, which only relies on this interface, so any custom implementation gets it for free.
 */
export interface Cache extends CacheEntities {}
