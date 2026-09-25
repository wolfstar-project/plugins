import type { CacheEntityName, CacheEntityTypes, EntityCache } from "@wolfstar/plugin-cache";
import type { GatewayClient } from "../GatewayClient.js";
import type { Structure } from "../structures/Structure.js";

/**
 * The options to fetch an entity with.
 */
export interface FetchOptions {
  /**
   * Whether to skip the cache lookup and always hit the API.
   *
   * @default false
   */
  force?: boolean;
  /**
   * Whether to store the entity fetched from the API in the cache.
   *
   * @default true
   */
  cache?: boolean;
}

/**
 * The base class of every manager: it reads raw data from one of the client's entity caches, falls back to the REST
 * API when asked to, and wraps the result in a {@link Structure}.
 *
 * @remarks
 * The cache only ever holds raw API data, building structures is always the manager's job. Without a cache, `get`
 * always resolves to `undefined` and `fetch` always hits the API.
 *
 * @typeParam Name The name of the entity cache this manager reads from.
 * @typeParam Value The structure this manager builds.
 * @typeParam Args The arguments identifying an entity, e.g. `[id]` or `[guildId, userId]`.
 */
export abstract class CachedManager<
  Name extends CacheEntityName,
  Value extends Structure<object>,
  Args extends readonly string[],
> {
  /**
   * The client this manager belongs to.
   */
  public readonly client: GatewayClient;

  /**
   * The name of the entity cache this manager reads from.
   */
  public readonly entity: Name;

  public constructor(client: GatewayClient, entity: Name) {
    this.client = client;
    this.entity = entity;
  }

  /**
   * The entity cache this manager reads from, or `undefined` when the client has no cache.
   */
  public get cache(): EntityCache<CacheEntityTypes[Name]> | undefined {
    return this.client.cache?.[this.entity] as EntityCache<CacheEntityTypes[Name]> | undefined;
  }

  /**
   * Gets an entity from the cache.
   *
   * @param args The arguments identifying the entity.
   * @returns The entity, or `undefined` if it is not cached.
   */
  public async get(...args: Args): Promise<Value | undefined> {
    const raw = await this.cache?.get(this.resolveKey(...args));
    return raw === undefined ? undefined : this.createStructure(raw);
  }

  /**
   * Gets an entity from the cache, fetching it from the API (and caching it) on a cache miss.
   *
   * @example
   * ```typescript
   * await client.users.fetch(userId); // cache first
   * await client.users.fetch(userId, { force: true }); // always the API
   * await client.users.fetch(userId, { force: true, cache: false }); // the API, without storing the result
   * ```
   *
   * @param args The arguments identifying the entity, optionally followed by {@link FetchOptions}.
   */
  public async fetch(...args: [...Args] | [...Args, FetchOptions]): Promise<Value> {
    const ids = args.slice(0, this.resolveKey.length) as unknown as Args;
    const { force = false, cache = true } = (args[this.resolveKey.length] ?? {}) as FetchOptions;

    if (!force) {
      const cached = await this.get(...ids);
      if (cached) return cached;
    }

    const raw = await this.fetchRaw(...ids);
    if (cache) await this.storeRaw(ids, raw);
    return this.createStructure(raw);
  }

  /**
   * Fetches an entity from the API, bypassing and then updating the cache. Same as `fetch(...args, { force: true })`.
   *
   * @param args The arguments identifying the entity.
   */
  public refresh(...args: Args): Promise<Value> {
    return this.fetch(...args, { force: true });
  }

  /**
   * Wraps raw data in this manager's structure.
   *
   * @param data The raw data.
   */
  public abstract createStructure(data: CacheEntityTypes[Name]): Value;

  /**
   * Gets the cache key of an entity.
   *
   * @param args The arguments identifying the entity.
   */
  public abstract resolveKey(...args: Args): string;

  /**
   * Fetches the raw data of an entity from the API.
   *
   * @param args The arguments identifying the entity.
   */
  protected abstract fetchRaw(...args: Args): Promise<CacheEntityTypes[Name]>;

  /**
   * Stores an entity fetched from the API in the cache.
   *
   * @param args The arguments identifying the entity.
   * @param raw The raw data of the entity.
   */
  protected async storeRaw(args: Args, raw: CacheEntityTypes[Name]): Promise<void> {
    await this.cache?.set(this.resolveKey(...args), raw);
  }
}
