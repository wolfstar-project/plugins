/**
 * The options of {@link fetchRecommendedShardCount}.
 */
export interface RecommendedShardCountOptions {
  /**
   * How many guilds a gateway shard should hold. Discord's recommendation is based on 1000.
   *
   * @default 1000
   */
  guildsPerShard?: number;
  /**
   * Rounds the count up to a multiple of it, e.g. the number of shards times the gateway shards per shard.
   *
   * @default 1
   */
  multipleOf?: number;
}

/**
 * Fetches how many gateway shards Discord recommends for the bot, like discord.js's `fetchRecommendedShardCount`.
 *
 * @param token The bot token.
 * @param options How many guilds per gateway shard, and what to round the count up to.
 */
export async function fetchRecommendedShardCount(
  token: string,
  options: RecommendedShardCountOptions = {},
): Promise<number> {
  const { guildsPerShard = 1000, multipleOf = 1 } = options;
  const response = await fetch("https://discord.com/api/v10/gateway/bot", {
    headers: { Authorization: `Bot ${token.replace(/^Bot\s*/i, "")}` },
  });
  if (!response.ok) {
    throw new Error(
      `Could not fetch the recommended shard count: ${response.status} ${response.statusText}`,
    );
  }

  const { shards } = (await response.json()) as { shards: number };
  return Math.ceil((shards * (1000 / guildsPerShard)) / multipleOf) * multipleOf;
}

/**
 * Gets the gateway shard receiving the events of a guild.
 *
 * @param guildId The ID of the guild.
 * @param shardCount The total number of gateway shards.
 */
export function shardIdForGuild(guildId: string, shardCount: number): number {
  return Number((BigInt(guildId) >> 22n) % BigInt(shardCount));
}
