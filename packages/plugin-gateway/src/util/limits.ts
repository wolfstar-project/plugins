import type { CacheEntityName } from "@wolfstar/plugin-cache";
import type { CacheEntityOptions } from "./cache.js";
import type { SweeperOptions } from "./Sweepers.js";

/**
 * Builds the {@link GatewayClientOptions.cacheOptions} bounding the caches of some entities, like discord.js's
 * `Options.cacheWithLimits`. A number is the `maxSize` of the entity, an object is its whole options.
 *
 * @example
 * ```typescript
 * const client = new GatewayClient({
 *   intents,
 *   // Keep the 200 most recent messages, no presences, and up to 1000 members, plus any member in a voice channel.
 *   cacheOptions: cacheWithLimits({
 *     messages: 200,
 *     presences: 0,
 *     members: { maxSize: 1_000, keepOverLimit: (member) => member.voice?.channelId != null },
 *   }),
 * });
 * ```
 *
 * @param limits The `maxSize` or the options of each entity.
 */
export function cacheWithLimits(
  limits: Partial<Record<CacheEntityName, number | CacheEntityOptions>>,
): Partial<Record<CacheEntityName, CacheEntityOptions>> {
  return Object.fromEntries(
    Object.entries(limits).map(([name, limit]) => [
      name,
      typeof limit === "number" ? { maxSize: limit } : limit,
    ]),
  );
}

/**
 * Ready-made {@link GatewayClientOptions.sweepers}, for a bot that only needs recent messages and threads: every hour,
 * messages untouched for 30 minutes are evicted, and so are threads archived for more than four hours.
 *
 * @remarks
 * Unlike discord.js's `Options.DefaultSweeperSettings`, which is empty, it sweeps. Spread it to override an entity:
 * `sweepers: { ...DefaultSweeperSettings, users: { interval: 3_600, filter: () => (user) => user.bot } }`.
 */
export const DefaultSweeperSettings: SweeperOptions = Object.freeze({
  messages: { interval: 3_600, lifetime: 1_800 },
  threads: { interval: 3_600, lifetime: 14_400 },
});
