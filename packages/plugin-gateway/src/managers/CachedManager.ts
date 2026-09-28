import {
  isIterableCache,
  mergeValues,
  type Awaitable,
  type CacheEntityName,
  type CacheEntityTypes,
  type EntityCache,
  type IterableEntityCache,
} from "@wolfstar/plugin-cache";
import type { GatewayClient } from "../GatewayClient.js";
import type { Guild } from "../structures/guilds/Guild.js";
import { bindClient, type StructureMixin } from "../structures/Structure.js";
import { isPromiseLike, whenAll } from "../util/cache.js";
import type { CacheErrorContext } from "../util/events.js";
import { GatewayTypeError } from "../errors/GatewayError.js";

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
 * The base class of every manager, the `BaseManager` of the discord.js RFC #11426: it reads raw data from one of the
 * client's entity caches, falls back to the REST API when asked to, and wraps the result in a
 * {@link StructureMixin | structure} with {@link CachedManager.construct}.
 *
 * @remarks
 * The cache only ever holds raw API data, building structures is always the manager's job. Without a store for its
 * entity (see the client's `makeCache`), `get` always resolves to `undefined` and `fetch` always hits the API.
 *
 * A failing store (e.g. Redis being unreachable) emits `cacheError` and, with the client's default
 * `cacheErrors: "miss"`, is treated as a cache miss.
 *
 * Every method is asynchronous since the cache can be Redis, except {@link CachedManager.cached}, which reads a
 * synchronous cache (`createInMemoryCache`) without awaiting it.
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
  Value extends StructureMixin<object>,
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
    return this._get(...args);
  }

  /**
   * Gets an entity from a synchronous cache, without awaiting it: the synchronous counterpart of
   * {@link CachedManager.get}, for hot paths such as message filters.
   *
   * @remarks
   * It builds the same structure as `get`, relations included, so the entity caches they are read from must be
   * synchronous too, which they all are with `createInMemoryCache`. `manager.cache?.synchronous` tells whether it can
   * be called.
   *
   * An asynchronous cache throws rather than returning `undefined`: it cannot tell whether the entity is cached, and
   * reporting a miss would silently skip whatever the caller does with cached entities, e.g. a filter.
   *
   * @example
   * ```typescript
   * const member = client.members.cached(guildId, userId);
   * ```
   *
   * @param args The arguments identifying the entity.
   * @returns The entity, or `undefined` if it is not cached or the client has no cache.
   * @throws {TypeError} When the entity cache, or one of the caches its relations are read from, is asynchronous.
   */
  public cached(...args: Args): Value | undefined {
    const { cache } = this;
    if (cache === undefined) return undefined;
    if (cache.synchronous !== true) {
      throw new GatewayTypeError("CacheAsynchronous", this.entity);
    }

    const value = this._get(...args);
    if (isPromiseLike(value)) {
      // Nothing awaits the promise anymore, so its rejection must not go unhandled.
      value.catch(() => undefined);
      throw new GatewayTypeError("CacheRelationsAsynchronous", this.entity);
    }

    return value;
  }

  /**
   * Gets an entity from the cache, synchronously when every cache it reads is: the {@link Awaitable} counterpart of
   * {@link CachedManager.get}, which both `get` and {@link CachedManager.cached} rely on.
   *
   * @param args The arguments identifying the entity.
   * @internal
   */
  public _get(...args: Args): Awaitable<Value | undefined> {
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
    const store = this.cache;
    if (store === undefined) return this.hydrate(data);

    if (!cache) {
      const existing = await this.guard("get", key, () => store.get(key), undefined);
      return this.hydrate(mergeValues(existing, data));
    }

    const { added } = await this.guard("upsert", key, () => store.upsert(key, data), {
      added: data,
    });
    return this.hydrate(added);
  }

  /**
   * Gets the cached structure of the entity raw data describes, or builds one from the data when it is not cached.
   * Used to resolve the relations of other structures, e.g. a message's author.
   *
   * @param data The raw data.
   */
  public async resolveData(data: CacheEntityTypes[Name]): Promise<Value> {
    return this._resolveData(data);
  }

  /**
   * The {@link Awaitable} counterpart of {@link CachedManager.resolveData}, synchronous when every cache it reads is.
   *
   * @param data The raw data.
   * @internal
   */
  public _resolveData(data: CacheEntityTypes[Name]): Awaitable<Value> {
    return whenAll([this.getByKey(this.keyOf(data))], ([cached]) => cached ?? this.build(data));
  }

  /**
   * Gets a guild from the cache, to resolve the `guild` of a structure. Synchronous when the guild cache is.
   *
   * @param guildId The ID of the guild, if the structure belongs to one.
   * @remarks
   * The guild does not resolve its own channel relations, see `GuildManager._getShallow`.
   *
   * @returns The guild, or `null` when there is no ID or the guild is not cached.
   */
  protected cachedGuild(guildId: string | null | undefined): Awaitable<Guild | null> {
    return guildId
      ? whenAll([this.client.guilds._getShallow(guildId)], ([guild]) => guild ?? null)
      : null;
  }

  /**
   * Builds the structure of raw data, resolving its relations from the cache. Without relations to resolve, the same
   * as {@link CachedManager.construct}.
   *
   * @param data The raw data.
   */
  public async hydrate(data: CacheEntityTypes[Name]): Promise<Value> {
    return this.build(data);
  }

  /**
   * The {@link Awaitable} counterpart of {@link CachedManager.hydrate}, synchronous when every cache the relations
   * are read from is. Managers resolving relations override this one, so `hydrate` and
   * {@link CachedManager.cached} build the same structures.
   *
   * @param data The raw data.
   * @internal
   */
  public _hydrate(data: CacheEntityTypes[Name]): Awaitable<Value> {
    return this.construct(data);
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
   * Wraps raw data in this manager's structure: the RFC's `StructureCreator`, which lives on the manager since the
   * cache only holds raw data.
   *
   * @param data The raw data.
   */
  public abstract construct(data: CacheEntityTypes[Name]): Value;

  /**
   * Wraps raw data in this manager's structure.
   *
   * @param data The raw data.
   * @deprecated Use {@link CachedManager.construct}.
   */
  public createStructure(data: CacheEntityTypes[Name]): Value {
    return this.construct(data);
  }

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
    const { cache } = this;
    if (cache) await this.guard("set", key, () => cache.set(key, raw), undefined);
  }

  /**
   * Gets this manager's store when it can enumerate its entries, for the `listCached` methods.
   *
   * @returns The store, or `undefined` when this entity is not cached.
   * @throws {TypeError} When the store cannot enumerate its entries.
   */
  protected iterableCache(): IterableEntityCache<CacheEntityTypes[Name]> | undefined {
    const { cache } = this;
    if (cache === undefined) return undefined;
    if (!isIterableCache(cache)) {
      throw new GatewayTypeError("CacheNotIterable", this.entity);
    }

    return cache;
  }

  /**
   * Gets an entity from the cache by its key, synchronously when every cache it reads is.
   *
   * @param key The cache key of the entity.
   */
  protected getByKey(key: string): Awaitable<Value | undefined> {
    const { cache } = this;
    return whenAll(
      [cache ? this.guard("get", key, () => cache.get(key), undefined) : undefined],
      ([raw]) => (raw === undefined ? undefined : this.build(raw)),
    );
  }

  /**
   * Runs a cache operation, reporting its failure through `cacheError`. With the client's `cacheErrors: "miss"`, a
   * failure resolves to `fallback`, otherwise it is rethrown. Synchronous when the operation is.
   *
   * @param operation The operation, for `cacheError`.
   * @param key The key of the entry, for `cacheError`.
   * @param run Runs the operation.
   * @param fallback What a failure resolves to under `cacheErrors: "miss"`.
   */
  protected guard<T>(
    operation: CacheErrorContext["operation"],
    key: string | null,
    run: () => Awaitable<T>,
    fallback: T,
  ): Awaitable<T> {
    const fail = (error: unknown): T => {
      this.client.emit("cacheError", error, { entity: this.entity, key, operation });
      if (this.client.cacheErrors === "throw") throw error;
      return fallback;
    };

    try {
      const result = run();
      return isPromiseLike(result) ? result.catch(fail) : result;
    } catch (error) {
      return fail(error);
    }
  }

  /**
   * Builds the structure of raw data with {@link CachedManager._hydrate}, bound to this manager's client.
   *
   * @param data The raw data.
   */
  protected build(data: CacheEntityTypes[Name]): Awaitable<Value> {
    return whenAll([this._hydrate(data)], ([value]) => bindClient(value, this.client));
  }
}

export {
  /**
   * The name of {@link CachedManager} in the discord.js RFC #11426.
   */
  CachedManager as BaseManager,
};
