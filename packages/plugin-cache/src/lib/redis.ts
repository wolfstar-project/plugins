/// <reference types="node" />
import { promisify } from "node:util";
import { brotliCompress, brotliDecompress, gunzip, gzip } from "node:zlib";
import {
  CacheEntityNames,
  GuildFieldCacheEntityNames,
  GuildKeyedCacheEntityNames,
} from "./operations.js";
import type { Cache, CacheEntityName, CacheEntityTypes, EntityCache } from "./types.js";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const brotliCompressAsync = promisify(brotliCompress);
const brotliDecompressAsync = promisify(brotliDecompress);

/**
 * The subset of the [`ioredis`](https://github.com/redis/ioredis) client API the Redis cache relies on. An `ioredis`
 * `Redis` or `Cluster` instance satisfies it, as can any other client exposing the same commands.
 */
export interface RedisClientLike {
  get(key: string): Promise<string | null>;
  mget(...keys: string[]): Promise<(string | null)[]>;
  set(key: string, value: string): Promise<unknown>;
  set(key: string, value: string, mode: "PX", milliseconds: number): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  exists(...keys: string[]): Promise<number>;
  zadd(key: string, ...scoreMembers: (string | number)[]): Promise<unknown>;
  zrem(key: string, ...members: string[]): Promise<number>;
  zrange(key: string, start: string, stop: string): Promise<string[]>;
  zcard(key: string): Promise<number>;
  zremrangebyscore(key: string, min: number | string, max: number | string): Promise<number>;
  multi(): RedisTransactionLike;
}

/**
 * The subset of an [`ioredis`](https://github.com/redis/ioredis) `MULTI` transaction the Redis cache relies on: every
 * queued command returns the transaction, and `exec` runs them atomically.
 */
export interface RedisTransactionLike {
  set(key: string, value: string): RedisTransactionLike;
  set(key: string, value: string, mode: "PX", milliseconds: number): RedisTransactionLike;
  del(...keys: string[]): RedisTransactionLike;
  zadd(key: string, ...scoreMembers: (string | number)[]): RedisTransactionLike;
  zrem(key: string, ...members: string[]): RedisTransactionLike;
  zremrangebyscore(key: string, min: number | string, max: number | string): RedisTransactionLike;
  /**
   * Optional: when available (`ioredis` has it), the guild indexes of a cache with a `ttl` expire once their guild
   * stops being written to. Without it, they are only pruned by the next write to their guild.
   */
  pexpire?(key: string, milliseconds: number): RedisTransactionLike;
  exec(): Promise<[error: Error | null, result: unknown][] | null>;
}

/**
 * Thrown when a value stored in Redis cannot be read back: invalid JSON, or compressed bytes that fail to decompress.
 *
 * @remarks
 * A missing value is not an error, `get` resolves to `undefined` for it. Redis connection errors are not wrapped
 * either, they propagate as the client throws them.
 */
export class CacheValueError extends Error {
  /**
   * The Redis key holding the unreadable value.
   */
  public readonly key: string;

  public constructor(key: string, cause: unknown) {
    super(`Cannot read the cached value at "${key}"`, { cause });
    this.name = "CacheValueError";
    this.key = key;
  }
}

/**
 * The algorithm used to compress values before writing them to Redis.
 */
export type RedisCacheCompression = "gzip" | "brotli" | "none";

export interface RedisEntityCacheOptions<Raw = unknown> {
  /**
   * The prefix of every Redis key owned by this entity cache.
   */
  prefix: string;
  /**
   * The time-to-live of every entry, in seconds. Entries never expire when omitted.
   */
  ttl?: number;
  /**
   * The compression algorithm to use.
   *
   * @default "none"
   */
  compression?: RedisCacheCompression;
  /**
   * The minimum size, in bytes, a serialized value must reach to be compressed. Small payloads rarely benefit from it.
   *
   * @default 1024
   */
  compressionThreshold?: number;
  /**
   * Resolves the guild an entry belongs to, indexing the entries by guild so {@link RedisEntityCache.deleteGuild}
   * does not have to scan the whole cache. Entries it resolves no guild for are not indexed. Without it, nothing is
   * indexed and `deleteGuild` resolves to `null`.
   *
   * On delete, it is first called without the value: when the key alone gives the guild away, the value is not
   * read back.
   */
  guildOf?: (key: string, value?: Raw) => string | undefined;
}

// The most keys a single `DEL`/`ZREM` of `deleteGuild` sends, so a large guild does not make one huge command.
const DeleteGuildChunkSize = 500;

// Compressed values are stored as `<marker><base64>`. JSON can never start with either marker, so values written with
// a different `compression` setting (e.g. before it was turned on) are still read back correctly.
const CompressionMarkers = { gzip: "gz:", brotli: "br:" } as const;

/**
 * An {@link EntityCache} backed by Redis.
 *
 * @remarks
 * Every entry is stored as its own string key (`<prefix>:<key>`), and a sorted set (`<prefix>:@index`) tracks the
 * stored keys with their expiration time as score, which is what `keys`, `entries`, `getSize`, and `clear` read from.
 *
 * With {@link RedisEntityCacheOptions.guildOf}, one more sorted set per guild (`<prefix>:@guild:<guildId>`) tracks the
 * keys of that guild's entries the same way, and `<prefix>:@guilds` lists the guilds having one, for `clear`.
 */
export class RedisEntityCache<Raw> implements EntityCache<Raw> {
  public readonly prefix: string;
  public readonly ttl: number | undefined;
  public readonly compression: RedisCacheCompression;
  public readonly compressionThreshold: number;

  readonly #redis: RedisClientLike;
  readonly #guildOf: ((key: string, value?: Raw) => string | undefined) | undefined;

  public constructor(redis: RedisClientLike, options: RedisEntityCacheOptions<Raw>) {
    if (options.ttl !== undefined && !(options.ttl > 0)) {
      throw new RangeError(`ttl must be a positive amount of seconds, received ${options.ttl}`);
    }

    this.#redis = redis;
    this.prefix = options.prefix;
    this.ttl = options.ttl;
    this.compression = options.compression ?? "none";
    this.compressionThreshold = options.compressionThreshold ?? 1024;
    this.#guildOf = options.guildOf;
  }

  public async get(key: string): Promise<Raw | undefined> {
    const valueKey = this.valueKey(key);
    const value = await this.#redis.get(valueKey);
    return value === null ? undefined : this.deserialize(valueKey, value);
  }

  public async set(key: string, value: Raw): Promise<void> {
    const serialized = await this.serialize(value);
    const guildId = this.#guildOf?.(key, value);
    // The value and its index entries are written in one transaction, so neither can exist without the other.
    const transaction = this.#redis.multi();
    if (this.ttl === undefined) {
      transaction.set(this.valueKey(key), serialized).zadd(this.indexKey, "+inf", key);
      if (guildId !== undefined) {
        transaction
          .zadd(this.guildIndexKey(guildId), "+inf", key)
          .zadd(this.guildsKey, "+inf", guildId);
      }
    } else {
      const now = Date.now();
      const milliseconds = Math.round(this.ttl * 1000);
      transaction
        .set(this.valueKey(key), serialized, "PX", milliseconds)
        .zadd(this.indexKey, now + milliseconds, key)
        // Pruning on every write keeps the index bounded even when nothing ever enumerates it.
        .zremrangebyscore(this.indexKey, "-inf", now);
      if (guildId !== undefined) {
        const guildIndexKey = this.guildIndexKey(guildId);
        transaction
          .zadd(guildIndexKey, now + milliseconds, key)
          .zremrangebyscore(guildIndexKey, "-inf", now)
          .zadd(this.guildsKey, now + milliseconds, guildId)
          .zremrangebyscore(this.guildsKey, "-inf", now);
        // Every write pushes the expiration back, so the indexes outlive every entry they list.
        transaction.pexpire?.(guildIndexKey, milliseconds);
        transaction.pexpire?.(this.guildsKey, milliseconds);
      }
    }

    await execute(transaction);
  }

  public async has(key: string): Promise<boolean> {
    return (await this.#redis.exists(this.valueKey(key))) > 0;
  }

  public async delete(key: string): Promise<boolean> {
    const guildId = await this.readGuild(key);
    const transaction = this.#redis.multi().del(this.valueKey(key)).zrem(this.indexKey, key);
    if (guildId !== undefined) transaction.zrem(this.guildIndexKey(guildId), key);

    const [deleted] = await execute(transaction);
    return (deleted as number) > 0;
  }

  public async clear(): Promise<void> {
    const keys = await this.#redis.zrange(this.indexKey, "0", "-1");
    if (keys.length > 0) await this.#redis.del(...keys.map((key) => this.valueKey(key)));

    const guilds = this.#guildOf ? await this.#redis.zrange(this.guildsKey, "0", "-1") : [];
    await this.#redis.del(
      this.indexKey,
      this.guildsKey,
      ...guilds.map((guildId) => this.guildIndexKey(guildId)),
    );
  }

  /**
   * Deletes every entry of a guild, reading their keys from the guild's index rather than scanning the cache.
   *
   * @remarks
   * Only indexed entries are deleted: when `guildOf` is set on a cache already holding entries, the ones written
   * before are left behind until they expire or the cache is cleared.
   *
   * @param guildId The ID of the guild.
   * @returns The amount of deleted entries, or `null` without {@link RedisEntityCacheOptions.guildOf}.
   */
  public async deleteGuild(guildId: string): Promise<number | null> {
    if (this.#guildOf === undefined) return null;

    const guildIndexKey = this.guildIndexKey(guildId);
    const keys = await this.#redis.zrange(guildIndexKey, "0", "-1");
    let deleted = 0;
    for (let index = 0; index < keys.length; index += DeleteGuildChunkSize) {
      const chunk = keys.slice(index, index + DeleteGuildChunkSize);
      // Only the listed keys leave the guild index: entries written meanwhile stay indexed.
      const [count] = await execute(
        this.#redis
          .multi()
          .del(...chunk.map((key) => this.valueKey(key)))
          .zrem(this.indexKey, ...chunk)
          .zrem(guildIndexKey, ...chunk),
      );
      deleted += count as number;
    }

    await this.#redis.zrem(this.guildsKey, guildId);
    return deleted;
  }

  public async getSize(): Promise<number> {
    await this.prune();
    return this.#redis.zcard(this.indexKey);
  }

  public async keys(): Promise<string[]> {
    await this.prune();
    return this.#redis.zrange(this.indexKey, "0", "-1");
  }

  public async values(): Promise<Raw[]> {
    return (await this.entries()).map(([, value]) => value);
  }

  public async entries(): Promise<[key: string, value: Raw][]> {
    const keys = await this.keys();
    if (keys.length === 0) return [];

    const values = await this.#redis.mget(...keys.map((key) => this.valueKey(key)));
    const entries: [key: string, value: Raw][] = [];
    for (const [index, value] of values.entries()) {
      // The value may have been evicted by Redis between both reads.
      if (value !== null) {
        const key = keys[index]!;
        entries.push([key, await this.deserialize(this.valueKey(key), value)]);
      }
    }

    return entries;
  }

  /**
   * Gets the Redis key a value is stored at.
   * @param key The entity cache key.
   */
  public valueKey(key: string): string {
    return `${this.prefix}:${key}`;
  }

  /**
   * The Redis key of the sorted set indexing the stored keys.
   */
  public get indexKey(): string {
    return `${this.prefix}:@index`;
  }

  /**
   * Gets the Redis key of the sorted set indexing a guild's entries.
   * @param guildId The ID of the guild.
   */
  public guildIndexKey(guildId: string): string {
    return `${this.prefix}:@guild:${guildId}`;
  }

  /**
   * The Redis key of the sorted set listing the guilds having an index.
   */
  public get guildsKey(): string {
    return `${this.prefix}:@guilds`;
  }

  /**
   * Reads the guild of a stored entry, to remove the entry from its guild index.
   * @param key The entity cache key.
   */
  private async readGuild(key: string): Promise<string | undefined> {
    if (this.#guildOf === undefined) return undefined;

    // Most guild-scoped keys start with the guild ID, sparing a read (and a decompression) on every delete.
    const fromKey = this.#guildOf(key);
    if (fromKey !== undefined) return fromKey;

    let value: Raw | undefined;
    try {
      value = await this.get(key);
    } catch (error) {
      // An unreadable value is deleted all the same, it only stays listed in its guild index.
      if (error instanceof CacheValueError) return undefined;
      throw error;
    }

    return value === undefined ? undefined : this.#guildOf(key, value);
  }

  private async prune(): Promise<void> {
    if (this.ttl !== undefined)
      await this.#redis.zremrangebyscore(this.indexKey, "-inf", Date.now());
  }

  private async serialize(value: Raw): Promise<string> {
    const json = JSON.stringify(value);
    if (this.compression === "none" || Buffer.byteLength(json) < this.compressionThreshold) {
      return json;
    }

    const compressed =
      this.compression === "gzip" ? await gzipAsync(json) : await brotliCompressAsync(json);
    return `${CompressionMarkers[this.compression]}${compressed.toString("base64")}`;
  }

  private async deserialize(valueKey: string, value: string): Promise<Raw> {
    try {
      if (value.startsWith(CompressionMarkers.gzip)) {
        return JSON.parse((await gunzipAsync(decode(value))).toString("utf8")) as Raw;
      }

      if (value.startsWith(CompressionMarkers.brotli)) {
        return JSON.parse((await brotliDecompressAsync(decode(value))).toString("utf8")) as Raw;
      }

      return JSON.parse(value) as Raw;
    } catch (error) {
      throw new CacheValueError(valueKey, error);
    }
  }
}

/**
 * Runs a transaction, throwing the first command error, and resolves to the command results.
 */
async function execute(transaction: RedisTransactionLike): Promise<unknown[]> {
  const results = await transaction.exec();
  if (results === null) throw new Error("The Redis transaction was aborted");

  return results.map(([error, result]) => {
    if (error) throw error;
    return result;
  });
}

function decode(value: string): Buffer {
  return Buffer.from(value.slice(3), "base64");
}

/**
 * A {@link Cache} whose entity caches are all {@link RedisEntityCache}s.
 */
export type RedisCache = {
  readonly [Name in CacheEntityName]: RedisEntityCache<CacheEntityTypes[Name]>;
};

export interface RedisCacheOptions {
  /**
   * The Redis client to use, e.g. an [`ioredis`](https://github.com/redis/ioredis) instance.
   */
  redis: RedisClientLike;
  /**
   * The prefix of every Redis key owned by the cache, which allows several caches to share a database.
   *
   * @default "wolfstar:cache"
   */
  prefix?: string;
  /**
   * The compression algorithm to use for values of at least {@link RedisCacheOptions.compressionThreshold} bytes.
   *
   * @default "none"
   */
  compression?: RedisCacheCompression;
  /**
   * The minimum size, in bytes, a serialized value must reach to be compressed.
   *
   * @default 1024
   */
  compressionThreshold?: number;
  /**
   * The time-to-live per entity cache, in seconds. Entity caches left out never expire.
   */
  ttl?: Partial<Record<CacheEntityName, number>>;
  /**
   * Whether to index the guild-scoped entity caches by guild, so a `GUILD_DELETE` drops a guild's entries without
   * scanning every entity cache. It costs one more sorted-set write per write, and a read before every delete.
   *
   * @remarks
   * Entries written while it was off are not indexed: turning it on for a populated cache leaves them behind on
   * `GUILD_DELETE`, until they expire or the cache is cleared.
   *
   * @default true
   */
  indexGuilds?: boolean;
}

/**
 * The guild of an entry keyed by its guild (`${guildId}:...`), matching what the `deletePrefix` scan drops.
 */
function guildOfKey(key: string, value?: unknown): string | undefined {
  const separator = key.indexOf(":");
  return separator > 0 ? key.slice(0, separator) : guildOfField(key, value);
}

/**
 * The guild of an entry keyed by its own ID, matching what the `deleteWhere` scan over `guild_id` drops.
 */
function guildOfField(_key: string, value?: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const guildId = (value as { guild_id?: unknown }).guild_id;
  return typeof guildId === "string" ? guildId : undefined;
}

const GuildResolvers: Partial<
  Record<CacheEntityName, (key: string, value?: unknown) => string | undefined>
> = Object.fromEntries([
  ...GuildKeyedCacheEntityNames.map((name) => [name, guildOfKey] as const),
  ...GuildFieldCacheEntityNames.map((name) => [name, guildOfField] as const),
]);

/**
 * The default prefix of every Redis key owned by a cache created with {@link createRedisCache}.
 */
export const DefaultRedisCachePrefix = "wolfstar:cache";

/**
 * Creates a {@link Cache} stored in Redis, optionally compressing its values.
 *
 * @example
 * ```typescript
 * import { createRedisCache } from '@wolfstar/plugin-cache';
 * import { Redis } from 'ioredis';
 *
 * const cache = createRedisCache({
 *   redis: new Redis(process.env.REDIS_URL!),
 *   compression: 'gzip',
 *   ttl: { guilds: 60 * 60, users: 30 * 60 },
 * });
 * ```
 *
 * @param options The options for the cache.
 */
export function createRedisCache(options: RedisCacheOptions): RedisCache & Cache {
  const {
    redis,
    prefix = DefaultRedisCachePrefix,
    compression,
    compressionThreshold,
    ttl,
    indexGuilds = true,
  } = options;

  return Object.freeze(
    Object.fromEntries(
      CacheEntityNames.map((name) => [
        name,
        new RedisEntityCache(redis, {
          prefix: `${prefix}:${name}`,
          ttl: ttl?.[name],
          compression,
          compressionThreshold,
          guildOf: indexGuilds ? GuildResolvers[name] : undefined,
        }),
      ]),
    ) as RedisCache,
  );
}
