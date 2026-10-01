import type { CacheEntityName } from "@wolfstar/plugin-cache";
import type { StructureMixin } from "../structures/Structure.js";
import type { Cache, RawAPIType, StructureCreator } from "./cache.js";

/**
 * The {@link Cache} of an entity that is not cached: always empty, writes are dropped.
 */
export class NullCache<
  Value extends StructureMixin<object>,
  Raw extends RawAPIType<Value> = RawAPIType<Value>,
> implements Cache<Value, Raw> {
  public readonly synchronous = true;

  public readonly construct: StructureCreator<Value, Raw>;

  /**
   * The name of the entity this cache stands for.
   */
  public readonly name: CacheEntityName;

  public constructor(creator: StructureCreator<Value, Raw>, name: CacheEntityName) {
    this.construct = creator;
    this.name = name;
  }

  public add(data: Partial<Raw>): Value {
    return this.construct(data);
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
