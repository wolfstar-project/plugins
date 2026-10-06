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
import { bindClient, kClone, kPatch, type StructureMixin } from "../structures/Structure.js";
import { refreshRelations, whenAll, type Cache } from "../util/cache.js";
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
 * The arguments of a method of a manager the client holds for every guild: they start with the guild's ID, which a
 * manager built for one guild (`guild.members`, `client.guilds.members(guildId)`) fills in.
 *
 * @typeParam InGuild Whether the manager was built for one guild.
 * @typeParam Args The arguments after the guild's ID.
 */
export type GuildArgs<
  InGuild extends boolean,
  Args extends readonly unknown[],
> = InGuild extends true ? Args : [guildId: string, ...Args];

/**
 * Types the arguments of a method declared with {@link GuildArgs}, which always start with the guild's ID once
 * {@link fillGuildId} filled it in.
 *
 * @param args The arguments of the method.
 * @internal
 */
export function withGuildId<Args extends readonly unknown[]>(
  args: readonly unknown[],
): [guildId: string, ...Args] {
  return args as unknown as [guildId: string, ...Args];
}

/**
 * Makes methods of a manager the client holds for every guild fill in the guild's ID: on an instance built for one
 * guild, they call the client's manager, which holds the state and the cache, with that ID first.
 *
 * @param target The class of the manager.
 * @param getManager Gets the client's manager.
 * @param methods The names of the methods taking the guild's ID first.
 * @internal
 */
export function fillGuildId<Manager extends { client: GatewayClient; guildId: string | undefined }>(
  target: abstract new (...args: any[]) => Manager,
  getManager: (client: GatewayClient) => object,
  methods: readonly string[],
): void {
  const prototype = target.prototype as Record<string, (...args: unknown[]) => unknown>;
  for (const name of methods) {
    const method = prototype[name]!;
    Reflect.defineProperty(prototype, name, {
      configurable: true,
      writable: true,
      value(this: Manager, ...args: unknown[]) {
        if (this.guildId === undefined) return method.apply(this, args);

        const manager = getManager(this.client) as typeof prototype;
        return manager[name]!(this.guildId, ...args);
      },
    });
  }
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
 * `client.members.cache.get(client.members.resolveKey(guildId, userId))`. The managers of a guild, a channel or a
 * thread take the ID alone: `guild.members.cache.get(userId)`.
 *
 * @typeParam Name The name of the entity this manager holds.
 * @typeParam Value The structure this manager builds.
 * @typeParam Args The arguments identifying an entity, e.g. `[id]` or `[guildId, userId]`.
 * @typeParam FetchArgs The arguments `fetch` and `refresh` take, which differ from `Args` on a manager built for one
 * guild.
 */
export abstract class CachedManager<
  Name extends CacheEntityName,
  Value extends StructureMixin<object>,
  Args extends readonly string[],
  FetchArgs extends readonly string[] = Args,
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

  /**
   * @param client The client.
   * @param name The name of the entity this manager holds.
   * @param guildId The guild whose entities {@link CachedManager.cache} is narrowed to, for the managers the client
   * holds for every guild.
   */
  public constructor(client: GatewayClient, name: Name, guildId?: string) {
    super(client);
    this.name = name;
    this.cache = guildId === undefined ? this.createCache() : this.createGuildCache(guildId);
  }

  // The cache of one guild: the client's, taking the ID of the entity alone instead of the key built by `resolveKey`.
  private createGuildCache(guildId: string): Cache<Value> {
    const cache = this.createCache();
    const resolveKey = this.resolveKey as unknown as (guildId: string, id: string) => string;
    const key = (id: string) => resolveKey.call(this, guildId, id);
    const prefix = key("");
    const keys = (): Awaitable<string[]> => {
      if (cache instanceof Map) {
        return [...(cache as Map<string, Value>).keys()].filter((entry) =>
          entry.startsWith(prefix),
        );
      }

      const store = this.iterableCache();
      return whenAll(
        [store ? this.guard("entries", null, () => store.entries(), []) : []],
        ([entries]) => entries.map(([entry]) => entry).filter((entry) => entry.startsWith(prefix)),
      );
    };

    const guildCache: Cache<Value> = {
      synchronous: cache.synchronous,
      construct: cache.construct,
      add: (data, overwrite) => cache.add(data, overwrite),
      clear: () =>
        whenAll([keys()], ([entries]) =>
          whenAll(
            entries.map((entry) => cache.delete(entry)),
            () => undefined,
          ),
        ),
      delete: (id) => cache.delete(key(id)),
      get: (id) => cache.get(key(id)),
      getSize: () => whenAll([keys()], ([entries]) => entries.length),
      has: (id) => cache.has(key(id)),
      set: (id, value) => whenAll([cache.set(key(id), value)], () => guildCache),
    };
    return guildCache;
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
   * The payload is written with `cache.add`: a cached entry is patched and returned, and with a cache of instances
   * (`CollectionCache`) that is the very instance the application may already hold. An entity that is not cached is
   * built and stored.
   *
   * With `cache` set to `false`, a patched clone is returned (or the entity is built) and the cache is left
   * untouched. The same goes for an entry the `filter` of the entity's policy rejects, whose cached entry is deleted
   * on top of that: a rejected update must not leave the outdated entry behind.
   *
   * @param data The raw data.
   * @param cache Whether to write to the cache.
   * @param options The cache key, when it cannot be derived from the data, and the extras of `createStructure`.
   * @internal
   */
  public async _add(
    data: CacheEntityTypes[Name],
    cache = true,
    { id, extras = [] }: AddOptions = {},
  ): Promise<Value> {
    // Data that cannot be keyed (a member without its user) needs the explicit key, and throws without one.
    const derived = id === undefined ? this.keyOf(data) : this.derivedKey(data);
    const key = id ?? derived!;
    if (!cache) return this.detached(await this.cache.get(key), data, extras);

    if (this.client.cacheFilter(this.name)) {
      const existing = await this.cache.get(key);
      if (!this.accepts(key, existing, data)) {
        if (existing) await this.cache.delete(key);
        return this.detached(existing, data, extras);
      }
    }

    // One atomic write: an upsert on a raw store, a patch of the cached instance on a cache of instances.
    if (key === derived && extras.length === 0) return this.cache.add(data as never);

    // `cache.add` keys the entry by its data, and builds it without extras.
    const existing = await this.cache.get(key);
    if (existing) {
      existing[kPatch](data as never);
      await this.cache.set(key, existing);
      return this.resolveRelations(existing, extras);
    }

    const entry = await this._build(data, extras);
    await this.cache.set(key, entry);
    return entry;
  }

  /**
   * Patches the cached entry of a key, if any, with the fields an endpoint answered without the entity itself.
   *
   * @remarks
   * Like every write of the managers, it follows the `filter` of the entity's policy: an entry whose patched data is
   * rejected is deleted from the cache.
   *
   * @param key The cache key of the entry.
   * @param patch The fields to patch, or a function computing them from the cached entry, `undefined` to leave it.
   * @internal
   */
  public async _patchCached(
    key: string,
    patch:
      | Partial<CacheEntityTypes[Name]>
      | ((cached: Value) => Partial<CacheEntityTypes[Name]> | undefined),
  ): Promise<void> {
    const cached = await this.cache.get(key);
    if (!cached) return;

    const data = typeof patch === "function" ? patch(cached) : patch;
    if (data === undefined) return;
    if (!this.accepts(key, cached, data)) {
      await this.cache.delete(key);
      return;
    }

    cached[kPatch](data as never);
    await this.cache.set(key, cached);
  }

  // Whether the policy of this entity lets an entry be cached, judging it merged with the cached one like
  // plugin-cache's `withPolicy`. Raw stores are wrapped by their policy already, see `GatewayClient.cacheFilter`.
  private accepts(key: string, existing: Value | undefined, data: object): boolean {
    const filter = this.client.cacheFilter(this.name);
    if (!filter) return true;

    const cached = (existing as unknown as { toJSON(): object } | undefined)?.toJSON();
    return filter(cached ? { ...cached, ...data } : data, key);
  }

  // The structure of data that is not written to the cache: a patched clone of the cached entry, or a new structure.
  private detached(
    existing: Value | undefined,
    data: CacheEntityTypes[Name],
    extras: unknown[],
  ): Awaitable<Value> {
    return existing
      ? this.resolveRelations(existing[kClone](data as never), extras)
      : this._build(data, extras);
  }

  private derivedKey(data: CacheEntityTypes[Name]): string | undefined {
    try {
      return this.keyOf(data);
    } catch {
      return undefined;
    }
  }

  // Resolves the relations of a structure again once it is patched: the patch drops the ones it invalidates (the
  // parent of a channel moved to another category), and a clone copies the ones of its original.
  private resolveRelations(value: Value, extras: unknown[]): Awaitable<Value> {
    return refreshRelations(value, (data) => this._build(data as never, extras));
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
  public async fetch(...args: [...FetchArgs] | [...FetchArgs, FetchOptions]): Promise<Value> {
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
  public refresh(...args: FetchArgs): Promise<Value> {
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
