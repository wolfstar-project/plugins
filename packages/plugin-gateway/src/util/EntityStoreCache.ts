import type { Awaitable, CacheEntityName, EntityCache } from "@wolfstar/plugin-cache";
import type { StructureMixin } from "../structures/Structure.js";
import { whenAll, type Cache, type RawAPIType, type StructureCreator } from "./cache.js";
import type { CacheErrorContext } from "./events.js";

/**
 * Runs a store operation, reporting its failure and resolving it to a fallback or rethrowing it.
 */
export type CacheGuard = <T>(
  operation: CacheErrorContext["operation"],
  key: string | null,
  run: () => Awaitable<T>,
  fallback: T,
) => Awaitable<T>;

/**
 * The options of {@link EntityStoreCache}.
 */
export interface EntityStoreCacheOptions<Value, Raw> {
  /**
   * The raw store.
   */
  store: EntityCache<Raw>;
  /**
   * Gets the key of raw data, for {@link EntityStoreCache.add}.
   */
  keyOf: (data: Partial<Raw>) => string;
  /**
   * Builds the structure of raw data read from the store, with its relations. May be asynchronous.
   *
   * @default The creator.
   */
  hydrate?: (data: Raw) => Awaitable<Value>;
  /**
   * Whether every method answers synchronously. The structures read their relations from other stores, so a view over
   * a synchronous store is only synchronous when those are too.
   *
   * @default () => store.synchronous === true
   */
  synchronous?: () => boolean;
  /**
   * Guards every store call.
   *
   * @default Lets errors through.
   */
  guard?: CacheGuard;
}

const unguarded: CacheGuard = (_operation, _key, run) => run();

/**
 * A {@link Cache} over a raw `@wolfstar/plugin-cache` store (in memory or Redis): the store holds raw API data, and a
 * structure is built on every read.
 *
 * @remarks
 * Unlike `CollectionCache`, two reads of the same key return two structures: do not rely on object identity.
 */
export class EntityStoreCache<
  Value extends StructureMixin<object>,
  Raw extends RawAPIType<Value> = RawAPIType<Value>,
> implements Cache<Value, Raw> {
  public readonly construct: StructureCreator<Value, Raw>;

  /**
   * The name of the entity this cache holds.
   */
  public readonly name: CacheEntityName;

  /**
   * The raw store.
   */
  public readonly store: EntityCache<Raw>;

  readonly #keyOf: (data: Partial<Raw>) => string;

  readonly #hydrate: (data: Raw) => Awaitable<Value>;

  readonly #guard: CacheGuard;

  readonly #synchronous: (() => boolean) | undefined;

  public constructor(
    creator: StructureCreator<Value, Raw>,
    name: CacheEntityName,
    options: EntityStoreCacheOptions<Value, Raw>,
  ) {
    this.construct = creator;
    this.name = name;
    this.store = options.store;
    this.#keyOf = options.keyOf;
    this.#hydrate = options.hydrate ?? creator;
    this.#guard = options.guard ?? unguarded;
    this.#synchronous = options.synchronous;
  }

  public get synchronous(): boolean {
    return this.#synchronous ? this.#synchronous() : this.store.synchronous === true;
  }

  public add(data: Partial<Raw>, overwrite = false): Awaitable<Value> {
    const raw = data as Raw;
    const key = this.#keyOf(data);
    return whenAll(
      [
        this.#guard("upsert", key, () => this.store.upsert(key, data, { overwrite }), {
          added: raw,
        }),
      ],
      ([{ added }]) => this.#hydrate(added),
    );
  }

  public clear(): Awaitable<void> {
    return this.#guard("clear", null, () => this.store.clear(), undefined);
  }

  public delete(key: string): Awaitable<boolean> {
    return this.#guard("delete", key, () => this.store.delete(key), false);
  }

  public get(key: string): Awaitable<Value | undefined> {
    return whenAll([this.#guard("get", key, () => this.store.get(key), undefined)], ([raw]) =>
      raw === undefined ? undefined : this.#hydrate(raw),
    );
  }

  public getSize(): Awaitable<number> {
    return this.#guard("getSize", null, () => this.store.getSize(), 0);
  }

  public has(key: string): Awaitable<boolean> {
    return this.#guard("has", key, () => this.store.has(key), false);
  }

  public set(key: string, value: Value): Awaitable<this> {
    const raw = (value as unknown as { toJSON(): Raw }).toJSON();
    return whenAll(
      [this.#guard("set", key, () => this.store.set(key, raw), undefined)],
      () => this,
    );
  }
}
