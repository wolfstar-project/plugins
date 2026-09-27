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
