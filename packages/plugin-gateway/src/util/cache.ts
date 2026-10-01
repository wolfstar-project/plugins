import type { Awaitable, CacheEntityName } from "@wolfstar/plugin-cache";
import { kRelations, type StructureMixin } from "../structures/Structure.js";

/**
 * The raw API data a {@link StructureMixin | structure} wraps.
 */
export type RawAPIType<Value extends StructureMixin<object>> =
  Value extends StructureMixin<infer Type> ? Type : never;

/**
 * A function building a {@link StructureMixin | structure} out of its raw API data.
 */
export type StructureCreator<
  Value extends StructureMixin<object>,
  Raw extends RawAPIType<Value> = RawAPIType<Value>,
> = (data: Partial<Raw>) => Value;

/**
 * Whether an {@link Awaitable} is a promise, rather than the value itself.
 *
 * @internal
 */
export function isPromiseLike<T>(value: Awaitable<T>): value is Promise<T> {
  return typeof (value as { then?: unknown } | null | undefined)?.then === "function";
}

/**
 * Waits for a list of {@link Awaitable}s like `Promise.all`, then calls a function with their values. Unlike
 * `Promise.all`, it stays synchronous when none of them is a promise, which is what lets a synchronous cache build
 * structures without awaiting them.
 *
 * @param values The values, some of which may be promises.
 * @param callback The function to call with the values.
 * @internal
 */
export function whenAll<const T extends readonly unknown[], R>(
  values: T,
  callback: (values: { -readonly [Index in keyof T]: Awaited<T[Index]> }) => Awaitable<R>,
): Awaitable<R> {
  return values.some(isPromiseLike)
    ? Promise.all(values).then(callback)
    : callback(values as { -readonly [Index in keyof T]: Awaited<T[Index]> });
}

/**
 * Resolves the relations of a structure again from its current data, and assigns them to that same structure: what
 * keeps a long-lived instance from holding the relations of the day it was built. Synchronous when `hydrate` is.
 *
 * @param value The structure.
 * @param hydrate Builds a structure of the same data, with its relations.
 * @returns The structure it was given.
 * @internal
 */
export function refreshRelations<Value extends StructureMixin<object>>(
  value: Value,
  hydrate: (data: RawAPIType<Value>) => Awaitable<StructureMixin<object>>,
): Awaitable<Value> {
  const data = (value as unknown as { toJSON(): RawAPIType<Value> }).toJSON();
  return whenAll([hydrate(data)], ([fresh]) => {
    value[kRelations] = fresh[kRelations];
    return value;
  });
}

/**
 * Picks the cached structures of some IDs, in their order, skipping the ones that are not cached: the equivalent of
 * the collections discord.js fills from its caches, e.g. `MessageMentions#channels`.
 *
 * @param ids The IDs.
 * @param cached The cached structures, by ID.
 * @internal
 */
export function pickCached<Value>(
  ids: readonly string[],
  cached: ReadonlyMap<string, Value> | undefined,
): Map<string, Value> {
  const picked = new Map<string, Value>();
  for (const id of ids) {
    const value = cached?.get(id);
    if (value) picked.set(id, value);
  }

  return picked;
}

/**
 * Reads the cached structures of some IDs, synchronously when every read is, skipping duplicates and the IDs that
 * are not cached. The {@link Awaitable} counterpart of discord.js's collections filled from its caches.
 *
 * @param ids The IDs.
 * @param get Reads the structure of an ID.
 * @internal
 */
export function whenCachedMap<Value>(
  ids: Iterable<string>,
  get: (id: string) => Awaitable<Value | null | undefined>,
): Awaitable<Map<string, Value>> {
  const unique = [...new Set(ids)];
  return whenAll(unique.map(get), (values) => {
    const map = new Map<string, Value>();
    for (const [index, value] of values.entries()) if (value) map.set(unique[index]!, value);
    return map;
  });
}

/**
 * The cache of a manager, as in the discord.js RFC #11426: it hands out {@link StructureMixin | structures}.
 *
 * @remarks
 * Every method is {@link Awaitable}: synchronous on an in-memory cache ({@link Cache.synchronous}), a promise on a
 * remote one. `await` works with both.
 *
 * @typeParam Value The structure the cache hands out.
 * @typeParam Raw The raw API data the structure wraps.
 */
export interface Cache<
  Value extends StructureMixin<object>,
  Raw extends RawAPIType<Value> = RawAPIType<Value>,
> {
  /**
   * Whether every method answers synchronously, never with a promise.
   */
  readonly synchronous: boolean;

  /**
   * The function used to construct instances of the structure this cache holds.
   */
  readonly construct: StructureCreator<Value, Raw>;

  /**
   * Adds or updates data in the cache, returning the instantiated structure. If the item exists, it patches it with
   * the new data unless `overwrite` is true. If it does not exist, it constructs a new instance and stores it.
   */
  add(data: Partial<Raw>, overwrite?: boolean): Awaitable<Value>;

  /**
   * Clears all items from the cache.
   */
  clear(): Awaitable<void>;

  /**
   * Deletes an item from the cache.
   */
  delete(key: string): Awaitable<boolean>;

  /**
   * Retrieves an item from the cache.
   */
  get(key: string): Awaitable<Value | undefined>;

  /**
   * Gets the number of items in the cache.
   */
  getSize(): Awaitable<number>;

  /**
   * Checks if an item exists in the cache.
   */
  has(key: string): Awaitable<boolean>;

  /**
   * Sets an item in the cache.
   */
  set(key: string, value: Value): Awaitable<this>;
}

/**
 * The options of the cache of one entity, set per entity through the client's `cacheOptions` option.
 */
export interface CacheEntityOptions {
  /**
   * The maximum amount of entries the cache holds, the oldest one being evicted when a new one would exceed it. `0`
   * holds nothing.
   *
   * @default Infinity
   */
  maxSize?: number;
}

/**
 * What a {@link CacheConstructor} receives as its third argument: how the client keys and refreshes the entity, and
 * the entity's `cacheOptions`.
 */
export interface CacheConstructorOptions<
  Value extends StructureMixin<object>,
  Raw extends RawAPIType<Value> = RawAPIType<Value>,
> extends CacheEntityOptions {
  /**
   * Gets the cache key of raw data. {@link Cache.add} must store under it: most entities are not keyed by their
   * `id` alone (a member is keyed by its guild and user, a message by its channel and ID, ...).
   */
  keyOf: (data: Partial<Raw>) => string;
  /**
   * Resolves the relations of an instance again (e.g. `member.voice`), and returns that same instance. Call it on
   * what {@link Cache.get} and {@link Cache.add} hand out, or long-lived instances keep the relations of the day
   * they were built.
   */
  refresh: (value: Value) => Value;
}

/**
 * A class building the {@link Cache} of an entity, as in the discord.js RFC #11426: what the client's
 * `cacheConstructor` option takes. It is instantiated once per entity.
 *
 * @remarks
 * The constructor receives `(creator, name, options)`:
 *
 * - `creator` builds a structure out of raw data, it is the cache's {@link Cache.construct};
 * - `name` is the name of the entity, e.g. `"users"`;
 * - `options` are the {@link CacheConstructorOptions}: `keyOf`, which `add` must key its entries with, `refresh`,
 *   to call on what `get` and `add` hand out, and the entity's `cacheOptions` (`maxSize`).
 *
 * Extending `CollectionCache` and forwarding the three arguments to `super` is the recommended way: it does all of
 * the above. The cache must be synchronous.
 *
 * A cache that is not a `Map` cannot be enumerated, so what needs to list its entries does not work with it: the
 * dispatch cascades (`GUILD_DELETE` and `CHANNEL_DELETE` leave the entries of the guild or channel behind), the
 * reconciliation of the guilds left while offline on `READY`, the granular emoji and sticker diff events, and
 * `listCached`.
 *
 * @example
 * ```typescript
 * class LoggingCache<
 *   Value extends StructureMixin<object>,
 *   Raw extends RawAPIType<Value> = RawAPIType<Value>,
 * > extends CollectionCache<Value, Raw> {
 *   public override delete(key: string): boolean {
 *     console.log(`${this.name}: ${key} removed`);
 *     return super.delete(key);
 *   }
 * }
 *
 * const client = new GatewayClient({ intents, cacheConstructor: LoggingCache });
 * ```
 */
export type CacheConstructor = new <Value extends StructureMixin<object>>(
  creator: StructureCreator<Value>,
  name: CacheEntityName,
  options: CacheConstructorOptions<Value>,
) => Cache<Value>;
