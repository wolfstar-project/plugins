/**
 * Shallow-merges `value` onto `existing` when both are plain objects, returning `value` otherwise.
 */
export function mergeValues<Value>(existing: Value | undefined, value: Value): Value {
  if (isObject(existing) && isObject(value)) return { ...existing, ...value };
  return value;
}

/**
 * Whether a value is a plain object, arrays excluded.
 *
 * @internal
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
