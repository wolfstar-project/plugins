import type { Awaitable } from "@wolfstar/plugin-cache";
import type { StructureMixin } from "../structures/Structure.js";
import { whenAll, type Cache } from "../util/cache.js";
import { BaseManager } from "./BaseManager.js";

/**
 * Manages the API methods of a data model along with a collection of instances, like discord.js's `DataManager`.
 *
 * @typeParam Value The structure this manager holds.
 * @typeParam Args The arguments identifying an entity, e.g. `[id]` or `[guildId, userId]`.
 */
export abstract class DataManager<
  Value extends StructureMixin<object>,
  Args extends readonly string[],
> extends BaseManager {
  /**
   * The cache of the items this manager holds.
   */
  public abstract readonly cache: Cache<Value>;

  /**
   * Gets the cache key of an entity, the one {@link DataManager.cache} takes.
   *
   * @param args The arguments identifying the entity.
   */
  public abstract resolveKey(...args: Args): string;

  /**
   * The cache of the items this manager holds, like discord.js's `DataManager#valueOf`.
   */
  public valueOf(): Cache<Value> {
    return this.cache;
  }

  /**
   * Resolves a structure or a cache key to a structure.
   *
   * @param value A structure, returned as is, or the cache key of an entity (its ID, for managers keyed by ID).
   * @returns The structure, or `null` if the key is not cached.
   */
  public resolve(value: Value | string): Awaitable<Value | null> {
    if (typeof value !== "string") return value ?? null;
    return whenAll([this.cache.get(value)], ([cached]) => cached ?? null);
  }

  /**
   * Resolves a structure or an ID to an ID.
   *
   * @param value A structure, or an ID.
   * @returns The ID, or `null` if the value is neither.
   */
  public resolveId(value: Value | string): string | null {
    if (typeof value === "string") return value;
    const id = (value as { id?: unknown } | null)?.id;
    return typeof id === "string" ? id : null;
  }
}
