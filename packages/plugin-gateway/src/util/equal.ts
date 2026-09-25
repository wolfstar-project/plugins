/**
 * Compares two JSON-like values structurally, regardless of key order. `undefined` properties count as missing, like
 * they do once serialized.
 *
 * @param a The first value.
 * @param b The second value.
 */
export function isDeepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a)) {
    const other = b as unknown[];
    return a.length === other.length && a.every((value, index) => isDeepEqual(value, other[index]));
  }

  const left = definedEntries(a as Record<string, unknown>);
  const right = new Map(definedEntries(b as Record<string, unknown>));
  return (
    left.length === right.size &&
    left.every(([key, value]) => right.has(key) && isDeepEqual(value, right.get(key)))
  );
}

function definedEntries(value: Record<string, unknown>): [string, unknown][] {
  return Object.entries(value).filter(([, entry]) => entry !== undefined);
}
