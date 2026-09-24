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
 * The options of {@link CachedManager._add}.
 */
export interface AddOptions {
  /**
   * The cache key of the entity, when it cannot be derived from its data.
   */
  key?: string;
}

/**
 * The base class of every manager: it reads raw data from one of the client's entity caches, falls back to the REST
 * API when asked to, and wraps the result in a {@link Structure}.
 *
 * @remarks
 * The cache only ever holds raw API data, building structures is always the manager's job. Without a cache, `get`
 * always resolves to `undefined` and `fetch` always hits the API.
 *
 * Like discord.js's `CachedManager`, every payload coming from the API goes through {@link CachedManager._add}, which
 * patches the cached entry and builds the structure. Structures are built by {@link CachedManager.hydrate}, which
 * resolves their relations (a message's author, a member's user, ...) from the cache, so they carry the latest known
 * data rather than the copy embedded in the payload.
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
    return this.getByKey(this.resolveKey(...args));
  }

  /**
   * Resolves a structure or a cache key to a structure, like discord.js's `DataManager#resolve`.
   *
   * @param value A structure, returned as is, or the cache key of an entity (its ID, for managers keyed by ID).
   * @returns The structure, or `null` if the key is not cached.
   */
  public async resolve(value: Value | string): Promise<Value | null> {
    if (typeof value !== "string") return value;
    return (await this.getByKey(value)) ?? null;
  }

  /**
   * Adds an API payload to the cache, patching the cached entry with it, and builds its structure. The counterpart of
   * discord.js's `CachedManager#_add`, asynchronous since the cache can be remote.
   *
   * @remarks
   * Like discord.js's `_patch`, the payload is shallowly merged into the cached entry, so the fields a partial payload
   * lacks keep their cached value. With `cache` set to `false`, the merged entry is built but not written.
   *
   * The merge is a read followed by a write, not an atomic operation: on a shared cache, a write landing in between
   * (another process, or a dispatch outside the guild's queue) is overwritten. `@wolfstar/plugin-cache` merges partial
   * dispatches the same way, and the fields at stake are refreshed by the next payload of the entity.
   *
   * @param data The raw data.
   * @param cache Whether to write the merged entry to the cache.
   * @param options The cache key, when it cannot be derived from the data.
   * @internal
   */
  public async _add(
    data: CacheEntityTypes[Name],
    cache = true,
    { key = this.keyOf(data) }: AddOptions = {},
  ): Promise<Value> {
    const existing = await this.cache?.get(key);
    const merged = existing ? { ...existing, ...data } : data;
    if (cache) await this.storeRaw(key, merged);
    return this.hydrate(merged);
  }

  /**
   * Gets the cached structure of the entity raw data describes, or builds one from the data when it is not cached.
   * Used to resolve the relations of other structures, e.g. a message's author.
   *
   * @param data The raw data.
   */
  public async resolveData(data: CacheEntityTypes[Name]): Promise<Value> {
    return (await this.getByKey(this.keyOf(data))) ?? this.hydrate(data);
  }

  /**
   * Builds the structure of raw data, resolving its relations from the cache. Without relations to resolve, the same
   * as {@link CachedManager.createStructure}.
   *
   * @param data The raw data.
   */
  public async hydrate(data: CacheEntityTypes[Name]): Promise<Value> {
    return this.createStructure(data);
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
    return this._add(raw, cache, { key: this.resolveKey(...ids) });
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
   * Gets the cache key of raw data.
   *
   * @param data The raw data.
   */
  public abstract keyOf(data: CacheEntityTypes[Name]): string;

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
   * Writes raw data to the cache.
   *
   * @param key The cache key of the entity.
   * @param raw The raw data of the entity.
   */
  protected async storeRaw(key: string, raw: CacheEntityTypes[Name]): Promise<void> {
    await this.cache?.set(key, raw);
  }

  /**
   * Gets an entity from the cache by its key.
   *
   * @param key The cache key of the entity.
   */
  protected async getByKey(key: string): Promise<Value | undefined> {
    const raw = await this.cache?.get(key);
    return raw === undefined ? undefined : this.hydrate(raw);
  }
}
