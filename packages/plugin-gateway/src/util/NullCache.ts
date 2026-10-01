import type { Awaitable, CacheEntityName } from "@wolfstar/plugin-cache";
import type { StructureMixin } from "../structures/Structure.js";
import type { Cache, RawAPIType, StructureCreator } from "./cache.js";

/**
 * The options of {@link NullCache}.
 */
export interface NullCacheOptions<Value, Raw> {
  /**
   * Builds the structure {@link NullCache.add} answers with, with its relations. May be asynchronous.
   *
   * @default The creator.
   */
  hydrate?: (data: Raw) => Awaitable<Value>;
  /**
   * Whether `hydrate` answers synchronously.
   *
   * @default () => true
   */
  synchronous?: () => boolean;
}

/**
 * The {@link Cache} of an entity that is not cached: always empty, writes are dropped.
 */
export class NullCache<
  Value extends StructureMixin<object>,
  Raw extends RawAPIType<Value> = RawAPIType<Value>,
> implements Cache<Value, Raw> {
  public readonly construct: StructureCreator<Value, Raw>;

  /**
   * The name of the entity this cache stands for.
   */
  public readonly name: CacheEntityName;

  readonly #hydrate: (data: Raw) => Awaitable<Value>;

  readonly #synchronous: (() => boolean) | undefined;

  public constructor(
    creator: StructureCreator<Value, Raw>,
    name: CacheEntityName,
    options: NullCacheOptions<Value, Raw> = {},
  ) {
    this.construct = creator;
    this.name = name;
    this.#hydrate = options.hydrate ?? creator;
    this.#synchronous = options.synchronous;
  }

  public get synchronous(): boolean {
    return this.#synchronous?.() ?? true;
  }

  public add(data: Partial<Raw>): Awaitable<Value> {
    return this.#hydrate(data as Raw);
  }

  public clear(): void {}

  public delete(): boolean {
    return false;
  }

  public get(): undefined {
    return undefined;
  }

  public getSize(): number {
    return 0;
  }

  public has(): boolean {
    return false;
  }

  public set(): this {
    return this;
  }
}
