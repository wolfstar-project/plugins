import {
  isIterableCache,
  type Awaitable,
  type CacheEntityName,
  type CacheEntityTypes,
  type EntityCache,
  type IterableEntityCache,
} from "@wolfstar/plugin-cache";
import type { GatewayClient } from "../GatewayClient.js";
import type { Guild } from "../structures/guilds/Guild.js";
import {
  bindClient,
  kClone,
  kPatch,
  kRelations,
  type StructureMixin,
} from "../structures/Structure.js";
import { whenAll, type Cache } from "../util/cache.js";
import type { CacheErrorContext } from "../util/events.js";
import { GatewayTypeError } from "../errors/GatewayError.js";
import { DataManager } from "./DataManager.js";

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
  id?: string;
  /**
   * Extra arguments handed to the manager's `createStructure`.
   */
  extras?: unknown[];
}

/**
 * Manages the API methods of a data model with a mutable cache of instances: the `CachedManager` of the discord.js
 * RFC #11426.
 *
 * @remarks
 * Reads go through {@link CachedManager.cache}: `client.users.cache.get(id)`. The cache is built by the client's
 * `cacheConstructor` (`CollectionCache` by default) and shared by every manager of the same entity.
 *
 * Caches keyed by more than an ID take the key built by `resolveKey`:
 * `client.members.cache.get(client.members.resolveKey(guildId, userId))`.
 *
 * @typeParam Name The name of the entity this manager holds.
 * @typeParam Value The structure this manager builds.
 * @typeParam Args The arguments identifying an entity, e.g. `[id]` or `[guildId, userId]`.
 */
export abstract class CachedManager<
  Name extends CacheEntityName,
  Value extends StructureMixin<object>,
  Args extends readonly string[],
> extends DataManager<Value, Args> {
  /**
   * The cache of this manager's entity.
   *
   * @example
   * ```typescript
   * const user = await client.users.cache.get(userId);
   * ```
   */
  public readonly cache: Cache<Value>;

  /**
   * The name of the entity this manager holds.
   */
  protected readonly name: Name;

  /**
   * Wraps raw data in this manager's structure: the RFC's `StructureCreator`.
   *
   * @param data The raw data.
   * @param extras The extra arguments passed to {@link CachedManager._add}.
   */
  protected abstract createStructure(data: CacheEntityTypes[Name], ...extras: unknown[]): Value;

  public constructor(client: GatewayClient, name: Name) {
    super(client);
    this.name = name;
    this.cache = this.createCache();
  }

  /**
   * Gets {@link CachedManager.cache} from the client. Managers whose entity spans several caches override it.
   */
  protected createCache(): Cache<Value> {
    return this.client.CacheConstructor<Value>(
      (data) => this.createStructure(data as unknown as CacheEntityTypes[Name]),
      this.name,
    );
  }

  /**
   * The raw store of this manager's entity, or `undefined` when it is not cached.
   */
  protected get rawStore(): EntityCache<CacheEntityTypes[Name]> | undefined {
    return this.client.cache?.[this.name] as EntityCache<CacheEntityTypes[Name]> | undefined;
  }

  /**
   * Adds an API payload to the cache and returns its structure, as in the RFC.
   *
   * @remarks
   * A cached entry is patched and returned: with a cache of instances (`CollectionCache`), that is the very instance
   * the application may already hold. With `cache` set to `false`, a patched clone is returned and the cache is left
   * untouched. Either way, its relations are resolved again from the patched data. An entity that is not cached is
   * built, and stored unless `cache` is `false`.
   *
   * @param data The raw data.
   * @param cache Whether to write to the cache.
   * @param options The cache key, when it cannot be derived from the data, and the extras of `createStructure`.
   * @internal
   */
  public async _add(
    data: CacheEntityTypes[Name],
    cache = true,
    { id = this.keyOf(data), extras = [] }: AddOptions = {},
  ): Promise<Value> {
    const existing = await this.cache.get(id);
    if (existing) {
      if (!cache) return this.resolveRelations(existing[kClone](data as never), extras);
      existing[kPatch](data as never);
      await this.cache.set(id, existing);
      return this.resolveRelations(existing, extras);
    }

    const entry = await this._build(data, extras);
    if (cache) await this.cache.set(id, entry);
    return entry;
  }

  // Resolves the relations of a structure again once it is patched: the patch drops the ones it invalidates (the
  // parent of a channel moved to another category), and a clone copies the ones of its original.
  private async resolveRelations(value: Value, extras: unknown[]): Promise<Value> {
    const data = (value as unknown as { toJSON(): CacheEntityTypes[Name] }).toJSON();
    value[kRelations] = (await this._build(data, extras))[kRelations];
    return value;
  }

  /**
   * Gets the cached structure of the entity raw data describes, or builds one from the data when it is not cached.
   * Used to resolve the relations of other structures, e.g. a message's author. Synchronous when the cache is.
   *
   * @param data The raw data.
   * @internal
   */
  public _resolveData(data: CacheEntityTypes[Name]): Awaitable<Value> {
    return whenAll([this.cache.get(this.keyOf(data))], ([cached]) => cached ?? this._build(data));
  }

  /**
   * Gets a guild from the cache, to resolve the `guild` of a structure. Synchronous when the guild cache is.
   *
   * @remarks
   * The guild does not resolve its own channel relations, see `GuildManager._getShallow`.
   *
   * @param guildId The ID of the guild, if the structure belongs to one.
   * @returns The guild, or `null` when there is no ID or the guild is not cached.
   */
  protected cachedGuild(guildId: string | null | undefined): Awaitable<Guild | null> {
    return guildId
      ? whenAll([this.client.guilds._getShallow(guildId)], ([guild]) => guild ?? null)
      : null;
  }

  /**
   * Builds the structure of raw data, resolving its relations from the cache; synchronous when every cache the
   * relations are read from is. Without relations to resolve, the same as `createStructure`.
   *
   * @param data The raw data.
   * @param extras The extra arguments passed to {@link CachedManager._add}.
   * @internal
   */
  public _hydrate(data: CacheEntityTypes[Name], ...extras: unknown[]): Awaitable<Value> {
    return this.createStructure(data, ...extras);
  }

  /**
   * Wraps raw data in this manager's structure, bound to this manager's client, without resolving its relations: the
   * creator handed to this entity's cache, always synchronous.
   *
   * @param data The raw data.
   * @param extras The extra arguments passed to {@link CachedManager._add}.
   * @internal
   */
  public _construct(data: CacheEntityTypes[Name], ...extras: unknown[]): Value {
    return bindClient(this.createStructure(data, ...extras), this.client);
  }

  /**
   * Builds the structure of raw data with {@link CachedManager._hydrate}, bound to this manager's client.
   *
   * @param data The raw data.
   * @param extras The extra arguments passed to {@link CachedManager._add}.
   * @internal
   */
  public _build(data: CacheEntityTypes[Name], extras: unknown[] = []): Awaitable<Value> {
    return whenAll([this._hydrate(data, ...extras)], ([value]) => bindClient(value, this.client));
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
    const id = this.resolveKey(...ids);

    if (!force) {
      const cached = await this.cache.get(id);
      if (cached) return cached;
    }

    const raw = await this.fetchRaw(...ids);
    return this._add(raw, cache, { id });
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
   * Gets the cache key of raw data.
   *
   * @param data The raw data.
   */
  public abstract keyOf(data: CacheEntityTypes[Name]): string;

  /**
   * Fetches the raw data of an entity from the API.
   *
   * @param args The arguments identifying the entity.
   */
  protected abstract fetchRaw(...args: Args): Promise<CacheEntityTypes[Name]>;

  /**
   * Gets this entity's raw store when it can enumerate its entries, for the `listCached` methods.
   *
   * @returns The store, or `undefined` when this entity is not cached.
   * @throws {TypeError} When the store cannot enumerate its entries.
   */
  protected iterableCache(): IterableEntityCache<CacheEntityTypes[Name]> | undefined {
    const store = this.rawStore;
    if (store === undefined) return undefined;
    if (!isIterableCache(store)) {
      throw new GatewayTypeError("CacheNotIterable", this.name);
    }

    return store;
  }

  /**
   * Runs a raw store operation, reporting its failure through `cacheError`. With the client's `cacheErrors: "miss"`,
   * a failure resolves to `fallback`, otherwise it is rethrown. Synchronous when the operation is.
   */
  protected guard<T>(
    operation: CacheErrorContext["operation"],
    key: string | null,
    run: () => Awaitable<T>,
    fallback: T,
  ): Awaitable<T> {
    return this.client.guardCache(this.name, operation, key, run, fallback);
  }
}
