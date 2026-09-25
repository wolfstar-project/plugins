/**
 * The `GET /gateway/bot` payload, the same shape as discord-api-types' `APIGatewayBotInfo`, which `@discordjs/ws`'s
 * `WebSocketManager#fetchGatewayInformation` returns.
 */
export interface GatewayInformation {
  url: string;
  shards: number;
  session_start_limit: {
    total: number;
    remaining: number;
    /**
     * In milliseconds.
     */
    reset_after: number;
    max_concurrency: number;
  };
}

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
   * Rounds the count up to a multiple of it, e.g. 16 for large bot sharding.
   *
   * @default 1
   */
  multipleOf?: number;
}

/**
 * Fetches `GET /gateway/bot`.
 *
 * @param token The bot token.
 */
export async function fetchGatewayInformation(token: string): Promise<GatewayInformation> {
  const response = await fetch("https://discord.com/api/v10/gateway/bot", {
    headers: { Authorization: `Bot ${token.replace(/^Bot\s*/i, "")}` },
  });
  if (!response.ok) {
    throw new Error(
      `Could not fetch the gateway information: ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as GatewayInformation;
}

/**
 * Turns Discord's recommended shard count into the one to spawn.
 *
 * @param recommended The `shards` of `GET /gateway/bot`.
 * @param options How many guilds per gateway shard, and what to round the count up to.
 */
export function resolveRecommendedShardCount(
  recommended: number,
  options: RecommendedShardCountOptions = {},
): number {
  const { guildsPerShard = 1000, multipleOf = 1 } = options;
  return Math.ceil((recommended * (1000 / guildsPerShard)) / multipleOf) * multipleOf;
}

/**
 * Fetches how many gateway shards Discord recommends for the bot, like discord.js's `fetchRecommendedShardCount`.
 *
 * @param token The bot token.
 * @param options How many guilds per gateway shard, and what to round the count up to.
 */
export async function fetchRecommendedShardCount(
  token: string,
  options?: RecommendedShardCountOptions,
): Promise<number> {
  const { shards } = await fetchGatewayInformation(token);
  return resolveRecommendedShardCount(shards, options);
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

/**
 * Caches `GET /gateway/bot`, so the shards share one request instead of each sending theirs, and keeps its session
 * start limit up to date with the identifies it grants.
 *
 * @internal
 */
export class GatewayInformationCache {
  readonly #fetch: () => Promise<GatewayInformation>;
  readonly #ttl: number;
  #value: GatewayInformation | null = null;
  #fetchedAt = 0;
  #resetAt = 0;
  #pending: Promise<GatewayInformation> | null = null;

  public constructor(fetcher: () => Promise<GatewayInformation>, ttl: number) {
    this.#fetch = fetcher;
    this.#ttl = ttl;
  }

  public async get(force = false): Promise<GatewayInformation> {
    const now = Date.now();
    if (!force && this.#value && now - this.#fetchedAt < this.#ttl) return this.#current(now);

    this.#pending ??= this.#fetch()
      .then((value) => {
        this.#value = structuredClone(value);
        this.#fetchedAt = Date.now();
        this.#resetAt = this.#fetchedAt + value.session_start_limit.reset_after;
        return value;
      })
      .finally(() => {
        this.#pending = null;
      });
    await this.#pending;
    return this.#current(Date.now());
  }

  /**
   * Counts an identify against the session start limit.
   */
  public consume(): void {
    if (!this.#value) return;
    this.#current(Date.now());
    this.#value.session_start_limit.remaining = Math.max(
      this.#value.session_start_limit.remaining - 1,
      0,
    );
  }

  #current(now: number): GatewayInformation {
    const value = this.#value!;
    const limit = value.session_start_limit;
    if (now >= this.#resetAt) {
      // The limit reset since the last fetch: Discord resets it every 24 hours.
      limit.remaining = limit.total;
      this.#resetAt = now + 86_400_000;
    }

    limit.reset_after = Math.max(this.#resetAt - now, 0);
    return structuredClone(value);
  }
}
