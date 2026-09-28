import { CacheEntityNames } from "./operations.js";
import {
  isIterableCache,
  type Awaitable,
  type Cache,
  type CacheEntityName,
  type CacheFactory,
  type CachePolicies,
  type CachePolicy,
  type CacheSetOptions,
  type CacheUpsertOptions,
  type CacheUpsertResult,
  type EntityCache,
  type IterableEntityCache,
} from "./types.js";

// Calls `callback` with the value, synchronously unless it is a promise, so wrapping a synchronous store keeps it so.
function then<T, R>(value: Awaitable<T>, callback: (value: T) => Awaitable<R>): Awaitable<R> {
  return typeof (value as { then?: unknown } | null | undefined)?.then === "function"
    ? (value as Promise<T>).then(callback)
    : callback(value as T);
}

/**
 * An {@link EntityCache} applying a {@link CachePolicy} to the writes of another one.
 */
class PolicyEntityCache<Raw> implements EntityCache<Raw> {
  public readonly synchronous: boolean | undefined;
  protected readonly cache: EntityCache<Raw>;
  readonly #policy: CachePolicy<Raw>;

  public constructor(cache: EntityCache<Raw>, policy: CachePolicy<Raw>) {
    this.cache = cache;
    this.#policy = policy;
    this.synchronous = cache.synchronous;
    if (cache.deleteGuild) this.deleteGuild = (guildId) => cache.deleteGuild!(guildId);
  }

  public deleteGuild?: (guildId: string) => Awaitable<number | null>;

  public get(key: string): Awaitable<Raw | undefined> {
    return this.cache.get(key);
  }

  public set(key: string, value: Raw, options?: CacheSetOptions): Awaitable<void> {
    if (this.#policy.filter && !this.#policy.filter(value, key)) {
      return then(this.cache.delete(key), () => undefined);
    }

    return this.cache.set(key, value, this.#options(value, key, options));
  }

  public upsert(
    key: string,
    data: Partial<Raw>,
    options?: CacheUpsertOptions,
  ): Awaitable<CacheUpsertResult<Raw>> {
    const { filter, ttl } = this.#policy;
    if (!filter && !ttl) return this.cache.upsert(key, data, options);

    // The policy judges the merged entry, which only a read tells.
    return then(this.cache.get(key), (existing) => {
      const added = (
        options?.overwrite || existing === undefined ? data : { ...existing, ...data }
      ) as Raw;
      if (filter && !filter(added, key)) {
        return then(this.cache.delete(key), () => ({ existing, added }));
      }

      return then(this.cache.set(key, added, this.#options(added, key, options)), () => ({
        existing,
        added,
      }));
    });
  }

  public has(key: string): Awaitable<boolean> {
    return this.cache.has(key);
  }

  public delete(key: string): Awaitable<boolean> {
    return this.cache.delete(key);
  }

  public clear(): Awaitable<void> {
    return this.cache.clear();
  }

  public getSize(): Awaitable<number> {
    return this.cache.getSize();
  }

  #options<Options extends CacheSetOptions>(
    value: Raw,
    key: string,
    options: Options | undefined,
  ): Options | undefined {
    if (!this.#policy.ttl) return options;
    return { ...options, ttl: this.#policy.ttl(value, key) } as Options;
  }
}

class IterablePolicyEntityCache<Raw>
  extends PolicyEntityCache<Raw>
  implements IterableEntityCache<Raw>
{
  declare protected readonly cache: IterableEntityCache<Raw>;

  public keys(): Awaitable<string[]> {
    return this.cache.keys();
  }

  public values(): Awaitable<Raw[]> {
    return this.cache.values();
  }

  public entries(): Awaitable<[key: string, value: Raw][]> {
    return this.cache.entries();
  }
}

/**
 * Wraps an {@link EntityCache} so its writes follow a {@link CachePolicy}: entries the policy's `filter` rejects are
 * not cached (and deleted when they were), and each entry lives as long as its `ttl` says.
 *
 * @remarks
 * It works with any store, synchronous ones stay synchronous. The wrapper can enumerate its entries, and exposes
 * `deleteGuild`, only when the wrapped store does.
 *
 * @example
 * ```typescript
 * import { MemoryEntityCache, withPolicy } from '@wolfstar/plugin-cache';
 *
 * // Only cache human users, for ten minutes.
 * const users = withPolicy(new MemoryEntityCache(), { filter: (user) => !user.bot, ttl: () => 600_000 });
 * ```
 *
 * @param cache The store to wrap.
 * @param policy The policy its writes follow.
 */
export function withPolicy<Raw>(
  cache: EntityCache<Raw>,
  policy: CachePolicy<Raw>,
): EntityCache<Raw> {
  return isIterableCache(cache)
    ? new IterablePolicyEntityCache(cache, policy)
    : new PolicyEntityCache(cache, policy);
}

/**
 * The options of {@link createCache}.
 */
export interface CreateCacheOptions {
  /**
   * Creates the store of each entity kind, `null` or `undefined` not to cache it. Called once per entity kind.
   */
  makeCache: CacheFactory;
  /**
   * The policies the stores' writes follow, see {@link withPolicy}.
   */
  policies?: CachePolicies;
}

/**
 * Creates a {@link Cache} out of a factory, holding only the stores it returns.
 *
 * @example
 * ```typescript
 * import { createCache, MemoryEntityCache } from '@wolfstar/plugin-cache';
 *
 * // Cache guilds, channels, and roles only, nothing else.
 * const cache = createCache({
 *   makeCache: (entity) => (['guilds', 'channels', 'roles'].includes(entity) ? new MemoryEntityCache() : null),
 * });
 * ```
 *
 * @param options The factory, and the policies of the stores.
 */
export function createCache(options: CreateCacheOptions): Cache {
  const { makeCache, policies } = options;
  const entries: [CacheEntityName, EntityCache<any>][] = [];
  for (const name of CacheEntityNames) {
    const store = makeCache(name);
    if (!store) continue;

    const policy = policies?.[name] as CachePolicy<unknown> | undefined;
    entries.push([name, policy ? withPolicy(store, policy) : store]);
  }

  return Object.freeze(Object.fromEntries(entries)) as Cache;
}
