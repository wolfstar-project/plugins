import type {
  Awaitable,
  CacheUpsertOptions,
  CacheUpsertResult,
  EntityCache,
  IterableEntityCache,
} from "@wolfstar/plugin-cache";
import { kPatch, type StructureMixin } from "../structures/Structure.js";
import { whenAll, type Cache, type RawAPIType } from "./cache.js";

function toRaw<Raw>(value: StructureMixin<object>): Raw {
  // A copy: the structure's own data keeps changing as it is patched.
  return { ...(value as unknown as { toJSON(): Raw }).toJSON() };
}

/**
 * A raw `@wolfstar/plugin-cache` store over a structure {@link Cache}, so that what writes raw data (the gateway
 * dispatches, their cascades, the policies) works against a cache of structures.
 *
 * @remarks
 * Writes patch the cached instance in place. Time-to-live options are ignored: structure caches have none.
 *
 * @internal
 */
class StructureStoreAdapter<
  Value extends StructureMixin<object>,
  Raw extends RawAPIType<Value>,
> implements EntityCache<Raw> {
  public constructor(protected readonly cache: Cache<Value, Raw>) {}

  public get synchronous(): boolean {
    return this.cache.synchronous;
  }

  public get(key: string): Awaitable<Raw | undefined> {
    return whenAll([this.cache.get(key)], ([value]) =>
      value === undefined ? undefined : toRaw<Raw>(value),
    );
  }

  public set(key: string, value: Raw): Awaitable<void> {
    return whenAll([this.cache.set(key, this.cache.construct(value))], () => undefined);
  }

  public upsert(
    key: string,
    data: Partial<Raw>,
    options?: CacheUpsertOptions,
  ): Awaitable<CacheUpsertResult<Raw>> {
    return whenAll([this.cache.get(key)], ([existing]) => {
      if (existing === undefined || options?.overwrite) {
        const before = existing === undefined ? undefined : toRaw<Raw>(existing);
        const value = this.cache.construct(data);
        return whenAll([this.cache.set(key, value)], () => ({
          existing: before,
          added: toRaw<Raw>(value),
        }));
      }

      const before = toRaw<Raw>(existing);
      existing[kPatch](data as never);
      // Written back for caches that do not hold the instance itself.
      return whenAll([this.cache.set(key, existing)], () => ({
        existing: before,
        added: toRaw<Raw>(existing),
      }));
    });
  }

  public has(key: string): Awaitable<boolean> {
    return this.cache.has(key);
  }

  public delete(key: string): Awaitable<boolean> {
    return this.cache.delete(key);
  }

  public clear(): Awaitable<void> {
    return this.cache.clear();
  }

  public getSize(): Awaitable<number> {
    return this.cache.getSize();
  }
}

class IterableStructureStoreAdapter<
  Value extends StructureMixin<object>,
  Raw extends RawAPIType<Value>,
>
  extends StructureStoreAdapter<Value, Raw>
  implements IterableEntityCache<Raw>
{
  declare protected readonly cache: Cache<Value, Raw> & Map<string, Value>;

  public keys(): string[] {
    return [...this.cache.keys()];
  }

  public values(): Raw[] {
    return [...this.cache.values()].map((value) => toRaw<Raw>(value));
  }

  public entries(): [key: string, value: Raw][] {
    return [...this.cache.entries()].map(([key, value]) => [key, toRaw<Raw>(value)]);
  }
}

/**
 * Creates the raw store of a structure cache, enumerable when the cache is a `Map` (e.g. `CollectionCache`).
 *
 * @param cache The structure cache.
 * @internal
 */
export function createStructureStoreAdapter<
  Value extends StructureMixin<object>,
  Raw extends RawAPIType<Value> = RawAPIType<Value>,
>(cache: Cache<Value, Raw>): EntityCache<Raw> {
  return cache instanceof Map
    ? new IterableStructureStoreAdapter<Value, Raw>(cache)
    : new StructureStoreAdapter<Value, Raw>(cache);
}
