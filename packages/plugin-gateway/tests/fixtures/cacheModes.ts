import { createInMemoryCache, type Cache } from "@wolfstar/plugin-cache";
import type { GatewayClientOptions } from "../../src/index.js";

/**
 * The cache configurations every caching guarantee is checked against: no cache at all, a partial raw cache (users
 * and guilds only), a full raw in-memory cache, and the default cache of structure instances.
 */
export const cacheModes = {
  none: (): Pick<GatewayClientOptions, "cache"> => ({ cache: null }),
  partial: (): Pick<GatewayClientOptions, "cache"> => ({
    cache: createInMemoryCache({ entities: ["users", "guilds"] }) as Cache,
  }),
  full: (): Pick<GatewayClientOptions, "cache"> => ({ cache: createInMemoryCache() }),
  collection: (): Pick<GatewayClientOptions, "cache"> => ({}),
} as const;

export type CacheMode = keyof typeof cacheModes;
