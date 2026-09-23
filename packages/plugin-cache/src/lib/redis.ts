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
    const value = await this.#redis.get(this.valueKey(key));
    return value === null ? undefined : this.deserialize(value);
  }

  public async set(key: string, value: Raw): Promise<void> {
    const serialized = await this.serialize(value);
    if (this.ttl === undefined) {
      await this.#redis.set(this.valueKey(key), serialized);
      await this.#redis.zadd(this.indexKey, "+inf", key);
    } else {
      const milliseconds = Math.round(this.ttl * 1000);
      await this.#redis.set(this.valueKey(key), serialized, "PX", milliseconds);
      await this.#redis.zadd(this.indexKey, Date.now() + milliseconds, key);
    }
  }

  public async has(key: string): Promise<boolean> {
    return (await this.#redis.exists(this.valueKey(key))) > 0;
  }

  public async delete(key: string): Promise<boolean> {
    const deleted = await this.#redis.del(this.valueKey(key));
    await this.#redis.zrem(this.indexKey, key);
    return deleted > 0;
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
      if (value !== null) entries.push([keys[index]!, await this.deserialize(value)]);
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

  private async deserialize(value: string): Promise<Raw> {
    if (value.startsWith(CompressionMarkers.gzip)) {
      return JSON.parse((await gunzipAsync(decode(value))).toString("utf8")) as Raw;
    }

    if (value.startsWith(CompressionMarkers.brotli)) {
      return JSON.parse((await brotliDecompressAsync(decode(value))).toString("utf8")) as Raw;
    }

    return JSON.parse(value) as Raw;
  }
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
