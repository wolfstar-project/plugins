import { createInMemoryCache, type Cache } from "@wolfstar/plugin-cache";

/**
 * The cache configurations every zero-caching guarantee is checked against: no cache at all, a partial cache (users
 * and guilds only), and a full in-memory cache.
 */
export const cacheModes = {
  none: (): Cache | undefined => undefined,
  partial: (): Cache | undefined => createInMemoryCache({ entities: ["users", "guilds"] }),
  full: (): Cache | undefined => createInMemoryCache(),
} as const;

export type CacheMode = keyof typeof cacheModes;
