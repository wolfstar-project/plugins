import type { Awaitable } from "@wolfstar/plugin-cache";
import type { StructureMixin } from "../structures/Structure.js";

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
> = (data: Raw) => Value;

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
