import { CacheEntityNames } from "./operations.js";
import type { Cache, CacheEntityName, CacheEntityTypes, EntityCache } from "./types.js";

/**
 * An {@link EntityCache} backed by a `Map`, optionally bounded as a least-recently-used cache.
 */
export class MemoryEntityCache<Raw> implements EntityCache<Raw> {
  /**
   * The maximum amount of entries, `Infinity` for an unbounded cache.
   */
  public readonly maxSize: number;

  readonly #items = new Map<string, Raw>();

  public constructor(maxSize = Infinity) {
    if (maxSize !== Infinity && (!Number.isInteger(maxSize) || maxSize < 0)) {
      throw new RangeError(
        `maxSize must be a non-negative integer or Infinity, received ${maxSize}`,
      );
    }

    this.maxSize = maxSize;
  }

  public get(key: string): Raw | undefined {
    const value = this.#items.get(key);
    if (value !== undefined && this.maxSize !== Infinity) {
      // Re-insert to mark the entry as the most recently used one.
      this.#items.delete(key);
      this.#items.set(key, value);
    }

    return value;
  }

  public set(key: string, value: Raw): void {
    if (this.maxSize === 0) return;

    this.#items.delete(key);
    this.#items.set(key, value);

    if (this.#items.size > this.maxSize) {
      // Maps iterate in insertion order, so the first key is the least recently used one.
      this.#items.delete(this.#items.keys().next().value!);
    }
  }

  public has(key: string): boolean {
    return this.#items.has(key);
  }

  public delete(key: string): boolean {
    return this.#items.delete(key);
  }

  public clear(): void {
    this.#items.clear();
  }

  public getSize(): number {
    return this.#items.size;
  }

  public keys(): string[] {
    return [...this.#items.keys()];
  }

  public values(): Raw[] {
    return [...this.#items.values()];
  }

  public entries(): [key: string, value: Raw][] {
    return [...this.#items.entries()];
  }
}

/**
 * A {@link Cache} whose entity caches are all {@link MemoryEntityCache}s.
 */
export type InMemoryCache = {
  readonly [Name in CacheEntityName]: MemoryEntityCache<CacheEntityTypes[Name]>;
};

export interface InMemoryCacheOptions {
  /**
   * The maximum amount of entries kept per entity cache before evicting the least recently used ones, either for
   * every entity cache or per entity cache. Entity caches left out are unbounded.
   *
   * @default Infinity
   */
  maxSize?: number | Partial<Record<CacheEntityName, number>>;
}

/**
 * Creates a {@link Cache} that keeps everything in the process' memory.
 *
 * @example
 * ```typescript
 * import { createInMemoryCache } from '@wolfstar/plugin-cache';
 *
 * // Keep at most 1000 messages around, everything else is unbounded.
 * const cache = createInMemoryCache({ maxSize: { messages: 1_000 } });
 * ```
 *
 * @param options The options for the cache.
 */
export function createInMemoryCache(options: InMemoryCacheOptions = {}): InMemoryCache & Cache {
  const { maxSize } = options;
  const resolve = (name: CacheEntityName) =>
    typeof maxSize === "number" ? maxSize : (maxSize?.[name] ?? Infinity);

  return Object.freeze(
    Object.fromEntries(
      CacheEntityNames.map((name) => [name, new MemoryEntityCache(resolve(name))]),
    ) as InMemoryCache,
  );
}
