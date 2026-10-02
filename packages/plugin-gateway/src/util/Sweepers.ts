import type { Collection } from "@discordjs/collection";
import type { AnyThreadChannel } from "../managers/ThreadManager.js";
import type { AutoModerationRule } from "../structures/automoderation/AutoModerationRule.js";
import type { ThreadMember } from "../structures/channels/ThreadMember.js";
import type { GuildEmoji } from "../structures/emojis/GuildEmoji.js";
import type { GuildBan } from "../structures/guilds/GuildBan.js";
import type { GuildMember } from "../structures/guilds/GuildMember.js";
import type { GuildInvite } from "../structures/invites/GuildInvite.js";
import type { Message } from "../structures/messages/Message.js";
import type { Presence } from "../structures/presences/Presence.js";
import type { StageInstance } from "../structures/stageInstances/StageInstance.js";
import type { Sticker } from "../structures/stickers/Sticker.js";
import type { User } from "../structures/users/User.js";
import type { VoiceState } from "../structures/voice/VoiceState.js";
import { GatewayRangeError, GatewayTypeError } from "../errors/GatewayError.js";
import type { GatewayClient } from "../GatewayClient.js";
import { NullCache } from "./NullCache.js";

/**
 * The structures held by the caches {@link Sweepers} can sweep, by entity.
 */
export interface SweepableEntities {
  autoModerationRules: AutoModerationRule;
  bans: GuildBan;
  emojis: GuildEmoji;
  invites: GuildInvite;
  members: GuildMember;
  messages: Message;
  presences: Presence;
  stageInstances: StageInstance;
  stickers: Sticker;
  threadMembers: ThreadMember;
  threads: AnyThreadChannel;
  users: User;
  voiceStates: VoiceState;
}

/**
 * The name of an entity whose cache {@link Sweepers} can sweep.
 */
export type SweepableEntityName = keyof SweepableEntities;

/**
 * Every {@link SweepableEntityName}.
 */
export const SweepableEntityNames = [
  "autoModerationRules",
  "bans",
  "emojis",
  "invites",
  "members",
  "messages",
  "presences",
  "stageInstances",
  "stickers",
  "threadMembers",
  "threads",
  "users",
  "voiceStates",
] as const satisfies readonly SweepableEntityName[];

/**
 * The entities whose sweeper can be set with a `lifetime` instead of a `filter`.
 */
export type LifetimeSweepableEntityName = "invites" | "messages" | "threads";

/**
 * Decides whether a sweep evicts an entry: `true` evicts it.
 */
export type SweepFilter<Value> = (
  value: Value,
  key: string,
  collection: Collection<string, Value>,
) => boolean;

/**
 * Builds the {@link SweepFilter} of one sweep, called once per sweep so that it can read the clock. Answering `null`
 * skips the sweep.
 */
export type SweepFilterFactory<Value> = () => SweepFilter<Value> | null;

/**
 * Sweeps an entity with a filter, every `interval` seconds.
 */
export interface SweeperFilterOptions<Value> {
  /**
   * The seconds between two sweeps. A non-positive or infinite interval does not schedule any.
   */
  interval: number;
  /**
   * Builds the filter of each sweep, see {@link SweepFilterFactory}.
   */
  filter: SweepFilterFactory<Value>;
  lifetime?: never;
}

/**
 * Sweeps an entity every `interval` seconds, evicting the entries older than `lifetime` seconds.
 */
export interface SweeperLifetimeOptions {
  /**
   * The seconds between two sweeps. A non-positive or infinite interval does not schedule any.
   */
  interval: number;
  /**
   * The seconds an entry lives: messages since they were created or last edited, threads since they were archived (an
   * active thread is never swept), invites since they expired (an invite that never expires is never swept). A
   * non-positive lifetime skips the sweep.
   */
  lifetime: number;
  filter?: never;
}

/**
 * The sweepers of the client, by entity, see {@link GatewayClientOptions.sweepers}.
 */
export type SweeperOptions = {
  [Name in SweepableEntityName]?: Name extends LifetimeSweepableEntityName
    ? SweeperFilterOptions<SweepableEntities[Name]> | SweeperLifetimeOptions
    : SweeperFilterOptions<SweepableEntities[Name]>;
};

/**
 * The options of {@link Sweepers.filterByLifetime}.
 */
export interface FilterByLifetimeOptions<Value> {
  /**
   * The seconds an entry lives, a non-positive value skips the sweep.
   *
   * @default 14400
   */
  lifetime?: number;
  /**
   * Gets the timestamp the lifetime is counted from, an entry without one is never swept.
   *
   * @default (value) => value.createdTimestamp
   */
  getComparisonTimestamp?: (
    value: Value,
    key: string,
    collection: Collection<string, Value>,
  ) => number | null | undefined;
  /**
   * Whether an entry is never swept.
   *
   * @default () => false
   */
  excludeFromSweep?: SweepFilter<Value>;
}

// The longest delay a timer waits for: a longer one fires right away.
const MaxTimerDelay = 2 ** 31 - 1;

const lifetimeFilters: {
  [Name in LifetimeSweepableEntityName]: FilterByLifetimeOptions<SweepableEntities[Name]>;
} = {
  invites: { getComparisonTimestamp: (invite) => invite.expiresTimestamp },
  messages: {
    getComparisonTimestamp: (message) => message.editedTimestamp ?? message.createdTimestamp,
  },
  threads: {
    getComparisonTimestamp: (thread) => thread.archiveTimestamp,
    excludeFromSweep: (thread) => !thread.archived,
  },
};

function lifetimeFilterOf<Name extends LifetimeSweepableEntityName>(
  entity: Name,
  lifetime: number,
): SweepFilterFactory<SweepableEntities[Name]> {
  return Sweepers.filterByLifetime({
    ...lifetimeFilters[entity],
    lifetime,
  } as FilterByLifetimeOptions<SweepableEntities[Name]>);
}

/**
 * Evicts entries from the caches of instances, on a schedule or on demand, like discord.js's `Sweepers`.
 *
 * @remarks
 * It works with the caches the client builds from {@link GatewayClientOptions.cacheConstructor}, the default
 * `CollectionCache` included: they are `Map`s. The stores of `@wolfstar/plugin-cache` hold raw data, and expire it
 * with the `ttl` of their policies instead, so sweeping them throws.
 *
 * A sweep only evicts entries from the cache: it emits no event but `cacheSweep`, and the structures the application
 * keeps stay valid.
 *
 * @example
 * ```typescript
 * const client = new GatewayClient({
 *   intents,
 *   sweepers: {
 *     // Every hour, forget the messages not touched for half an hour.
 *     messages: { interval: 3_600, lifetime: 1_800 },
 *     // Every hour, forget the bots.
 *     users: { interval: 3_600, filter: () => (user) => user.bot },
 *   },
 * });
 *
 * // On demand.
 * client.sweepers.sweepMessages(600);
 * ```
 */
export class Sweepers {
  /**
   * The options the sweepers were scheduled from.
   */
  public readonly options: SweeperOptions;

  readonly #client: GatewayClient;

  readonly #timers = new Map<SweepableEntityName, ReturnType<typeof setInterval>>();

  public constructor(client: GatewayClient, options: SweeperOptions = {}) {
    this.#client = client;
    this.options = options;
    for (const entity of SweepableEntityNames) this.#schedule(entity);
  }

  /**
   * Evicts the entries of an entity's cache the filter answers `true` for.
   *
   * @param entity The name of the entity.
   * @param filter Builds the filter of the sweep.
   * @returns The amount of entries evicted, `0` when the filter skips the sweep or the entity is not cached.
   */
  public sweep<Name extends SweepableEntityName>(
    entity: Name,
    filter: SweepFilterFactory<SweepableEntities[Name]>,
  ): number {
    const cache = this.#client.cacheOf(entity);
    if (cache === undefined || cache instanceof NullCache) return 0;
    if (!(cache instanceof Map)) throw new GatewayTypeError("CacheNotIterable", entity);

    const predicate = filter();
    if (predicate === null) return 0;

    const start = Date.now();
    const before = cache.size;
    for (const [key, value] of cache) {
      if (predicate(value, key, cache as unknown as Collection<string, never>)) cache.delete(key);
    }

    const swept = before - cache.size;
    this.#client.logger.debug(`[Sweepers] Swept ${swept} ${entity} in ${Date.now() - start}ms`);
    this.#client.emit("cacheSweep", entity, swept);
    return swept;
  }

  /**
   * Evicts the auto moderation rules the filter answers `true` for.
   */
  public sweepAutoModerationRules(filter: SweepFilterFactory<AutoModerationRule>): number {
    return this.sweep("autoModerationRules", filter);
  }

  /**
   * Evicts the bans the filter answers `true` for.
   */
  public sweepBans(filter: SweepFilterFactory<GuildBan>): number {
    return this.sweep("bans", filter);
  }

  /**
   * Evicts the emojis the filter answers `true` for.
   */
  public sweepEmojis(filter: SweepFilterFactory<GuildEmoji>): number {
    return this.sweep("emojis", filter);
  }

  /**
   * Evicts the invites that expired more than `lifetime` seconds ago.
   *
   * @param lifetime The seconds an invite lives past its expiration.
   */
  public sweepInvites(lifetime = 14_400): number {
    return this.sweep("invites", lifetimeFilterOf("invites", lifetime));
  }

  /**
   * Evicts the members the filter answers `true` for.
   */
  public sweepMembers(filter: SweepFilterFactory<GuildMember>): number {
    return this.sweep("members", filter);
  }

  /**
   * Evicts the messages created or last edited more than `lifetime` seconds ago.
   *
   * @param lifetime The seconds a message lives.
   */
  public sweepMessages(lifetime = 3_600): number {
    return this.sweep("messages", lifetimeFilterOf("messages", lifetime));
  }

  /**
   * Evicts the presences the filter answers `true` for.
   */
  public sweepPresences(filter: SweepFilterFactory<Presence>): number {
    return this.sweep("presences", filter);
  }

  /**
   * Evicts the stage instances the filter answers `true` for.
   */
  public sweepStageInstances(filter: SweepFilterFactory<StageInstance>): number {
    return this.sweep("stageInstances", filter);
  }

  /**
   * Evicts the stickers the filter answers `true` for.
   */
  public sweepStickers(filter: SweepFilterFactory<Sticker>): number {
    return this.sweep("stickers", filter);
  }

  /**
   * Evicts the thread members the filter answers `true` for.
   */
  public sweepThreadMembers(filter: SweepFilterFactory<ThreadMember>): number {
    return this.sweep("threadMembers", filter);
  }

  /**
   * Evicts the threads archived more than `lifetime` seconds ago, see {@link Sweepers.outdatedThreadSweepFilter}.
   *
   * @param lifetime The seconds a thread lives past its archival.
   */
  public sweepThreads(lifetime = 14_400): number {
    return this.sweep("threads", lifetimeFilterOf("threads", lifetime));
  }

  /**
   * Evicts the users the filter answers `true` for.
   */
  public sweepUsers(filter: SweepFilterFactory<User>): number {
    return this.sweep("users", filter);
  }

  /**
   * Evicts the voice states the filter answers `true` for.
   */
  public sweepVoiceStates(filter: SweepFilterFactory<VoiceState>): number {
    return this.sweep("voiceStates", filter);
  }

  /**
   * Stops the scheduled sweeps. On-demand sweeps keep working.
   */
  public destroy(): void {
    for (const timer of this.#timers.values()) clearInterval(timer);
    this.#timers.clear();
  }

  /**
   * Builds a filter factory evicting the entries older than a lifetime, for {@link Sweepers.sweep} and the `filter`
   * of a sweeper.
   *
   * @param options The lifetime, and what it is counted from.
   */
  public static filterByLifetime<Value>(
    options: FilterByLifetimeOptions<Value> = {},
  ): SweepFilterFactory<Value> {
    const {
      lifetime = 14_400,
      getComparisonTimestamp = (value: Value) =>
        (value as { createdTimestamp?: number | null }).createdTimestamp,
      excludeFromSweep = () => false,
    } = options;
    if (typeof lifetime !== "number") {
      throw new GatewayTypeError("InvalidType", "lifetime", "number");
    }

    return () => {
      if (lifetime <= 0) return null;
      const lifetimeMs = lifetime * 1_000;
      const now = Date.now();
      return (value, key, collection) => {
        if (excludeFromSweep(value, key, collection)) return false;
        const timestamp = getComparisonTimestamp(value, key, collection);
        if (typeof timestamp !== "number" || !timestamp) return false;
        return now - timestamp > lifetimeMs;
      };
    };
  }

  /**
   * Builds a filter factory evicting the archived threads that have been so for longer than a lifetime. Active
   * threads are never evicted.
   *
   * @param lifetime The seconds a thread lives past its archival.
   * @default 14400
   */
  public static outdatedThreadSweepFilter(lifetime = 14_400): SweepFilterFactory<AnyThreadChannel> {
    return lifetimeFilterOf("threads", lifetime);
  }

  #schedule(entity: SweepableEntityName): void {
    const options = this.options[entity] as
      | SweeperFilterOptions<never>
      | SweeperLifetimeOptions
      | undefined;
    if (options === undefined) return;

    const path = `sweepers.${entity}`;
    const { interval } = options;
    if (typeof interval !== "number" || Number.isNaN(interval)) {
      throw new GatewayTypeError("InvalidType", `${path}.interval`, "number");
    }

    let filter: SweepFilterFactory<never>;
    if (options.lifetime !== undefined) {
      if (typeof options.lifetime !== "number") {
        throw new GatewayTypeError("InvalidType", `${path}.lifetime`, "number");
      }

      if (!(entity in lifetimeFilters)) {
        throw new GatewayTypeError("InvalidType", `${path}.filter`, "function");
      }

      filter = lifetimeFilterOf(entity as LifetimeSweepableEntityName, options.lifetime);
    } else if (typeof options.filter === "function") {
      filter = options.filter;
    } else {
      throw new GatewayTypeError("InvalidType", `${path}.filter`, "function");
    }

    if (interval <= 0 || interval === Infinity) return;
    const delay = interval * 1_000;
    if (delay > MaxTimerDelay)
      throw new GatewayRangeError("SweeperIntervalTooLong", entity, interval);

    const timer = setInterval(() => {
      try {
        this.sweep(entity, filter as SweepFilterFactory<SweepableEntities[typeof entity]>);
      } catch (error) {
        this.#client.emit("cacheError", error, { entity, key: null, operation: "sweep" });
      }
    }, delay);
    timer.unref();
    this.#timers.set(entity, timer);
  }
}
