import { createInMemoryCache, type Cache } from "@wolfstar/plugin-cache";

/**
 * An in-memory cache whose stores answer like a remote one (Redis): every method returns a promise, and none of them
 * is `synchronous`.
 */
export function createAsyncCache(): Cache {
  const cache: Record<string, unknown> = {};
  for (const [name, store] of Object.entries(createInMemoryCache())) {
    if (typeof store !== "object" || store === null) {
      cache[name] = store;
      continue;
    }

    cache[name] = new Proxy(store as object, {
      get(target, property) {
        if (property === "synchronous") return false;
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === "function"
          ? async (...args: unknown[]) =>
              (value as (...a: unknown[]) => unknown).apply(target, args)
          : value;
      },
    });
  }

  return cache as unknown as Cache;
}
