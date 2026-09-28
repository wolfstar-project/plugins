import { mergeValues } from "./merge.js";
import { CacheEntityNames } from "./operations.js";
import { createCache } from "./policy.js";
import type {
  Cache,
  CacheEntityName,
  CachePolicies,
  CacheSetOptions,
  CacheUpsertOptions,
  CacheUpsertResult,
  IterableEntityCache,
} from "./types.js";

interface Entry<Raw> {
  value: Raw;
  /** The timestamp the entry expires at, `null` when it never does. */
  expiresAt: number | null;
}

/**
 * The options of a {@link MemoryEntityCache}, besides its `maxSize`.
 */
export interface MemoryEntityCacheOptions {
  /**
   * The default time-to-live of every entry, in milliseconds, `null` for entries to never expire. Each write can
   * override it, see {@link CacheSetOptions.ttl}.
   *
   * @default null
   */
  ttl?: number | null;
  /**
   * How often, in milliseconds, to drop the expired entries, `null` to only drop them when they are read. Without
   * it, expired entries nothing reads anymore stay in memory until they are evicted or the cache is cleared.
   *
   * @remarks
   * The timer does not keep the process alive, and {@link MemoryEntityCache.dispose} stops it.
   *
   * @default null
   */
  sweepInterval?: number | null;
}

/**
 * An {@link IterableEntityCache} backed by a `Map`, optionally bounded as a least-recently-used cache, with optional
 * per-entry time-to-live.
 */
export class MemoryEntityCache<Raw> implements IterableEntityCache<Raw> {
  /**
   * Always `true`: every method returns synchronously.
   */
  public readonly synchronous = true;

  /**
   * The maximum amount of entries, `Infinity` for an unbounded cache.
   */
  public readonly maxSize: number;

  /**
   * The default time-to-live of every entry, in milliseconds, `null` for entries to never expire.
   */
  public readonly ttl: number | null;

  readonly #items = new Map<string, Entry<Raw>>();
  #sweeper: ReturnType<typeof setInterval> | null = null;

  public constructor(maxSize = Infinity, options: MemoryEntityCacheOptions = {}) {
    if (maxSize !== Infinity && (!Number.isInteger(maxSize) || maxSize < 0)) {
      throw new RangeError(
        `maxSize must be a non-negative integer or Infinity, received ${maxSize}`,
      );
    }

    this.maxSize = maxSize;
    this.ttl = validateTtl(options.ttl ?? null);

    const sweepInterval = options.sweepInterval ?? null;
    if (sweepInterval !== null) {
      if (!(sweepInterval > 0)) {
        throw new RangeError(
          `sweepInterval must be a positive amount of milliseconds, received ${sweepInterval}`,
        );
      }

      this.#sweeper = setInterval(() => this.sweep(), sweepInterval);
      this.#sweeper.unref?.();
    }
  }

  public get(key: string): Raw | undefined {
    const entry = this.#live(key);
    if (entry !== undefined && this.maxSize !== Infinity) {
      // Re-insert to mark the entry as the most recently used one.
      this.#items.delete(key);
      this.#items.set(key, entry);
    }

    return entry?.value;
  }

  public set(key: string, value: Raw, options?: CacheSetOptions): void {
    const ttl = options?.ttl === undefined ? this.ttl : validateTtl(options.ttl);
    if (this.maxSize === 0) return;

    this.#items.delete(key);
    this.#items.set(key, { value, expiresAt: ttl === null ? null : Date.now() + ttl });

    if (this.#items.size > this.maxSize) {
      // Maps iterate in insertion order, so the first key is the least recently used one.
      this.#items.delete(this.#items.keys().next().value!);
    }
  }

  public upsert(
    key: string,
    data: Partial<Raw>,
    options?: CacheUpsertOptions,
  ): CacheUpsertResult<Raw> {
    const existing = this.#live(key)?.value;
    const added = (options?.overwrite ? data : mergeValues(existing, data as Raw)) as Raw;
    this.set(key, added, options);
    return { existing, added };
  }

  public has(key: string): boolean {
    return this.#live(key) !== undefined;
  }

  public delete(key: string): boolean {
    return this.#items.delete(key);
  }

  public clear(): void {
    this.#items.clear();
  }

  public getSize(): number {
    this.sweep();
    return this.#items.size;
  }

  public keys(): string[] {
    this.sweep();
    return [...this.#items.keys()];
  }

  public values(): Raw[] {
    this.sweep();
    return [...this.#items.values()].map((entry) => entry.value);
  }

  public entries(): [key: string, value: Raw][] {
    this.sweep();
    return [...this.#items].map(([key, entry]) => [key, entry.value]);
  }

  /**
   * Drops every expired entry.
   *
   * @returns The amount of dropped entries.
   */
  public sweep(): number {
    const now = Date.now();
    let swept = 0;
    for (const [key, entry] of this.#items) {
      if (entry.expiresAt !== null && entry.expiresAt < now) {
        this.#items.delete(key);
        swept++;
      }
    }

    return swept;
  }

  /**
   * Stops the timer of {@link MemoryEntityCacheOptions.sweepInterval}, if any. The cache keeps working, expired
   * entries are then only dropped when read.
   */
  public dispose(): void {
    if (this.#sweeper !== null) clearInterval(this.#sweeper);
    this.#sweeper = null;
  }

  // Gets an entry, dropping it when it expired.
  #live(key: string): Entry<Raw> | undefined {
    const entry = this.#items.get(key);
    if (entry?.expiresAt != null && entry.expiresAt < Date.now()) {
      this.#items.delete(key);
      return undefined;
    }

    return entry;
  }
}

function validateTtl(ttl: number | null): number | null {
  if (ttl !== null && !(ttl > 0)) {
    throw new RangeError(`ttl must be a positive amount of milliseconds or null, received ${ttl}`);
  }

  return ttl;
}

/**
 * A {@link Cache} created by {@link createInMemoryCache}.
 *
 * @deprecated Use {@link Cache}: the stores may be left out (`entities`) or wrapped by a policy (`policies`).
 */
export type InMemoryCache = Cache;

export interface InMemoryCacheOptions {
  /**
   * The entity kinds to cache, every other one is not. Every entity kind is cached when omitted.
   */
  entities?: readonly CacheEntityName[];
  /**
   * The maximum amount of entries kept per entity cache before evicting the least recently used ones, either for
   * every entity cache or per entity cache. Entity caches left out are unbounded.
   *
   * @default Infinity
   */
  maxSize?: number | Partial<Record<CacheEntityName, number>>;
  /**
   * The default time-to-live of the entries, in milliseconds, either for every entity cache or per entity cache.
   * Entity caches left out never expire their entries.
   */
  ttl?: number | Partial<Record<CacheEntityName, number>>;
  /**
   * How often, in milliseconds, every entity cache drops its expired entries, see
   * {@link MemoryEntityCacheOptions.sweepInterval}.
   *
   * @default null
   */
  sweepInterval?: number | null;
  /**
   * The policies deciding which entries get cached and for how long, per entity cache, see `withPolicy`.
   */
  policies?: CachePolicies;
}

/**
 * Creates a {@link Cache} that keeps everything in the process' memory.
 *
 * @example
 * ```typescript
 * import { createInMemoryCache } from '@wolfstar/plugin-cache';
 *
 * // Keep at most 1000 messages around for an hour, and cache nothing but guilds, channels, messages, and users.
 * const cache = createInMemoryCache({
 *   entities: ['guilds', 'channels', 'messages', 'users'],
 *   maxSize: { messages: 1_000 },
 *   ttl: { messages: 3_600_000 },
 *   sweepInterval: 60_000,
 * });
 * ```
 *
 * @param options The options for the cache.
 */
export function createInMemoryCache(options: InMemoryCacheOptions = {}): Cache {
  const { entities = CacheEntityNames, maxSize, ttl, sweepInterval, policies } = options;
  const included = new Set(entities);
  const resolve = <T>(
    value: T | Partial<Record<CacheEntityName, T>> | undefined,
    name: CacheEntityName,
  ): T | undefined =>
    typeof value === "object" && value !== null
      ? (value as Partial<Record<CacheEntityName, T>>)[name]
      : (value as T | undefined);

  return createCache({
    makeCache: (name) =>
      included.has(name)
        ? new MemoryEntityCache(resolve(maxSize, name) ?? Infinity, {
            ttl: resolve(ttl, name) ?? null,
            sweepInterval,
          })
        : null,
    policies,
  });
}
