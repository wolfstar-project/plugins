/// <reference types="node" />
import { promisify } from "node:util";
import { brotliCompress, brotliDecompress, gunzip, gzip } from "node:zlib";
import { CacheEntityNames } from "./operations.js";
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

export interface RedisEntityCacheOptions {
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
}

// Compressed values are stored as `<marker><base64>`. JSON can never start with either marker, so values written with
// a different `compression` setting (e.g. before it was turned on) are still read back correctly.
const CompressionMarkers = { gzip: "gz:", brotli: "br:" } as const;

/**
 * An {@link EntityCache} backed by Redis.
 *
 * @remarks
 * Every entry is stored as its own string key (`<prefix>:<key>`), and a sorted set (`<prefix>:@index`) tracks the
 * stored keys with their expiration time as score, which is what `keys`, `entries`, `getSize`, and `clear` read from.
 */
export class RedisEntityCache<Raw> implements EntityCache<Raw> {
  public readonly prefix: string;
  public readonly ttl: number | undefined;
  public readonly compression: RedisCacheCompression;
  public readonly compressionThreshold: number;

  readonly #redis: RedisClientLike;

  public constructor(redis: RedisClientLike, options: RedisEntityCacheOptions) {
    if (options.ttl !== undefined && !(options.ttl > 0)) {
      throw new RangeError(`ttl must be a positive amount of seconds, received ${options.ttl}`);
    }

    this.#redis = redis;
    this.prefix = options.prefix;
    this.ttl = options.ttl;
    this.compression = options.compression ?? "none";
    this.compressionThreshold = options.compressionThreshold ?? 1024;
  }

  public async get(key: string): Promise<Raw | undefined> {
    const valueKey = this.valueKey(key);
    const value = await this.#redis.get(valueKey);
    return value === null ? undefined : this.deserialize(valueKey, value);
  }

  public async set(key: string, value: Raw): Promise<void> {
    const serialized = await this.serialize(value);
    // The value and its index entry are written in one transaction, so neither can exist without the other.
    const transaction = this.#redis.multi();
    if (this.ttl === undefined) {
      transaction.set(this.valueKey(key), serialized).zadd(this.indexKey, "+inf", key);
    } else {
      const now = Date.now();
      const milliseconds = Math.round(this.ttl * 1000);
      transaction
        .set(this.valueKey(key), serialized, "PX", milliseconds)
        .zadd(this.indexKey, now + milliseconds, key)
        // Pruning on every write keeps the index bounded even when nothing ever enumerates it.
        .zremrangebyscore(this.indexKey, "-inf", now);
    }

    await execute(transaction);
  }

  public async has(key: string): Promise<boolean> {
    return (await this.#redis.exists(this.valueKey(key))) > 0;
  }

  public async delete(key: string): Promise<boolean> {
    const [deleted] = await execute(
      this.#redis.multi().del(this.valueKey(key)).zrem(this.indexKey, key),
    );
    return (deleted as number) > 0;
  }

  public async clear(): Promise<void> {
    const keys = await this.#redis.zrange(this.indexKey, "0", "-1");
    if (keys.length > 0) await this.#redis.del(...keys.map((key) => this.valueKey(key)));
    await this.#redis.del(this.indexKey);
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
}

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
        }),
      ]),
    ) as RedisCache,
  );
}
