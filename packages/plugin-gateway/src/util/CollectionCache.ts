import { Collection } from "@discordjs/collection";
import type { CacheEntityName } from "@wolfstar/plugin-cache";
import { kPatch, type StructureMixin } from "../structures/Structure.js";
import type { Cache, RawAPIType, StructureCreator } from "./cache.js";

/**
 * The options of {@link CollectionCache}.
 */
export interface CollectionCacheOptions<Value, Raw> {
  /**
   * Gets the key of raw data, for {@link CollectionCache.add}.
   *
   * @default (data) => data.id
   */
  keyOf?: (data: Partial<Raw>) => string;
  /**
   * Called with an instance every time it is read with `get` or updated with `add`, to bring what it holds besides
   * its data (its relations) up to date. It returns the instance to hand out.
   */
  refresh?: (value: Value) => Value;
  /**
   * The maximum amount of entries, the oldest one being evicted when a new one would exceed it.
   *
   * @default Infinity
   */
  maxSize?: number;
}

/**
 * The default {@link Cache}: an in-memory `Collection` of structure instances, like discord.js's caches.
 *
 * @remarks
 * `add` patches the cached instance in place, so a reference kept by the application sees later updates.
 *
 * Every method is synchronous. Being a `Collection`, it also has `find`, `filter`, `map`, ... which return plain
 * collections. Instances reached by iterating carry the relations of their last `get`.
 */
export class CollectionCache<
  Value extends StructureMixin<object>,
  Raw extends RawAPIType<Value> = RawAPIType<Value>,
>
  extends Collection<string, Value>
  implements Cache<Value, Raw>
{
  public static override get [Symbol.species](): typeof Collection {
    return Collection;
  }

  public readonly synchronous = true;

  public readonly construct: StructureCreator<Value, Raw>;

  /**
   * The name of the entity this cache holds.
   */
  public readonly name: CacheEntityName;

  readonly #keyOf: (data: Partial<Raw>) => string;

  readonly #refresh: ((value: Value) => Value) | undefined;

  readonly #maxSize: number;

  public constructor(
    creator: StructureCreator<Value, Raw>,
    name: CacheEntityName,
    options: CollectionCacheOptions<Value, Raw> = {},
  ) {
    super();
    this.construct = creator;
    this.name = name;
    this.#keyOf = options.keyOf ?? ((data) => (data as unknown as { id: string }).id);
    this.#refresh = options.refresh;
    this.#maxSize = options.maxSize ?? Infinity;
  }

  public add(data: Partial<Raw>, overwrite = false): Value {
    const key = this.#keyOf(data);
    const existing = overwrite ? undefined : super.get(key);
    if (existing !== undefined) {
      existing[kPatch](data as never);
      return this.#refresh ? this.#refresh(existing) : existing;
    }

    const value = this.construct(data);
    this.set(key, value);
    return this.#refresh ? this.#refresh(value) : value;
  }

  public override get(key: string): Value | undefined {
    const value = super.get(key);
    return value !== undefined && this.#refresh ? this.#refresh(value) : value;
  }

  public override set(key: string, value: Value): this {
    if (this.size >= this.#maxSize && !super.has(key)) {
      const oldest = this.keys().next();
      if (!oldest.done) super.delete(oldest.value);
    }

    return super.set(key, value);
  }

  public getSize(): number {
    return this.size;
  }
}
