import { CacheValueError, type RedisClientLike } from "./redis.js";
import type { Awaitable } from "./types.js";

/**
 * What a gateway shard needs to resume its session, the same shape as `@discordjs/ws`'s `SessionInfo`.
 */
export interface GatewaySessionInfo {
  /**
   * The URL to connect to when resuming.
   */
  resumeURL: string;
  /**
   * The sequence number of the last dispatch the shard received.
   */
  sequence: number;
  /**
   * The ID of the session.
   */
  sessionId: string;
  /**
   * The total number of shards when the shard identified. A session is not resumed once it changes.
   */
  shardCount: number;
  /**
   * The ID of the shard.
   */
  shardId: number;
}

/**
 * Stores the gateway sessions of the shards, so a restarted process resumes them instead of identifying again, see
 * `@wolfstar/plugin-gateway`'s `GatewayClientOptions.sessionStore`.
 */
export interface GatewaySessionStore {
  /**
   * Reads the session of a shard.
   *
   * @param shardId The ID of the shard.
   * @returns The session, or `null` when there is none to resume.
   */
  get(shardId: number): Awaitable<GatewaySessionInfo | null>;
  /**
   * Writes the session of a shard.
   *
   * @param shardId The ID of the shard.
   * @param info The session, or `null` once it can no longer be resumed.
   */
  set(shardId: number, info: GatewaySessionInfo | null): Awaitable<void>;
}

export interface RedisSessionStoreOptions {
  /**
   * The Redis client to use, e.g. an [`ioredis`](https://github.com/redis/ioredis) instance.
   */
  redis: Pick<RedisClientLike, "get" | "set" | "del">;
  /**
   * The prefix of every Redis key owned by the store, sessions live at `<prefix>:<shardId>`.
   *
   * @default "wolfstar:sessions"
   */
  prefix?: string;
  /**
   * The time-to-live of a session since its last write, in seconds, `null` to keep sessions until they are dropped.
   *
   * @remarks
   * Discord only lets a session be resumed for a while after its connection closes, and resuming an expired one costs
   * a connection before identifying. Every dispatch pushes the expiration back, so a shard receiving none for longer
   * than the ttl identifies on the next restart.
   *
   * @default 600
   */
  ttl?: number | null;
}

/**
 * The default prefix of every Redis key owned by a store created with {@link createRedisSessionStore}.
 */
export const DefaultRedisSessionStorePrefix = "wolfstar:sessions";

/**
 * A {@link GatewaySessionStore} backed by Redis, storing every session as JSON at `<prefix>:<shardId>`.
 */
export class RedisSessionStore implements GatewaySessionStore {
  public readonly prefix: string;
  public readonly ttl: number | null;

  readonly #redis: Pick<RedisClientLike, "get" | "set" | "del">;

  public constructor(options: RedisSessionStoreOptions) {
    const ttl = options.ttl === undefined ? 600 : options.ttl;
    if (ttl !== null && !(ttl > 0)) {
      throw new RangeError(`ttl must be a positive amount of seconds, received ${ttl}`);
    }

    this.#redis = options.redis;
    this.prefix = options.prefix ?? DefaultRedisSessionStorePrefix;
    this.ttl = ttl;
  }

  public async get(shardId: number): Promise<GatewaySessionInfo | null> {
    const key = this.key(shardId);
    const value = await this.#redis.get(key);
    if (value === null) return null;

    try {
      return JSON.parse(value) as GatewaySessionInfo;
    } catch (error) {
      throw new CacheValueError(key, error);
    }
  }

  public async set(shardId: number, info: GatewaySessionInfo | null): Promise<void> {
    const key = this.key(shardId);
    if (info === null) await this.#redis.del(key);
    else if (this.ttl === null) await this.#redis.set(key, JSON.stringify(info));
    else await this.#redis.set(key, JSON.stringify(info), "PX", Math.round(this.ttl * 1000));
  }

  /**
   * Gets the Redis key the session of a shard is stored at.
   * @param shardId The ID of the shard.
   */
  public key(shardId: number): string {
    return `${this.prefix}:${shardId}`;
  }
}

/**
 * Creates a {@link GatewaySessionStore} stored in Redis, for `@wolfstar/plugin-gateway`'s `sessionStore` option.
 *
 * @example
 * ```typescript
 * import { createRedisSessionStore } from '@wolfstar/plugin-cache';
 * import { Redis } from 'ioredis';
 *
 * const sessionStore = createRedisSessionStore({ redis: new Redis(process.env.REDIS_URL!) });
 * ```
 *
 * @param options The options for the store.
 */
export function createRedisSessionStore(options: RedisSessionStoreOptions): RedisSessionStore {
  return new RedisSessionStore(options);
}
