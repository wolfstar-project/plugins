/**
 * Emitted as an `error` when a dispatch takes longer than `GatewayClientOptions.dispatchTimeout` to process.
 *
 * @remarks
 * The dispatch is not cancelled: it keeps running, and later dispatches of its partition keep waiting for it, so the
 * event order is preserved. The error only reports that the partition is stuck, usually on a slow or unreachable
 * cache.
 */
export class DispatchTimeoutError extends Error {
  /**
   * The type of the slow dispatch, e.g. `MESSAGE_CREATE`.
   */
  public readonly type: string;

  /**
   * The shard the dispatch was received on.
   */
  public readonly shardId: number;

  /**
   * The partition the dispatch runs in, `null` for a barrier.
   */
  public readonly partition: string | null;

  /**
   * The timeout that was exceeded, in milliseconds.
   */
  public readonly timeout: number;

  public constructor(type: string, shardId: number, partition: string | null, timeout: number) {
    super(
      `Processing ${type} on shard ${shardId} (${partition ?? "barrier"}) took longer than ${timeout}ms`,
    );
    this.name = "DispatchTimeoutError";
    this.type = type;
    this.shardId = shardId;
    this.partition = partition;
    this.timeout = timeout;
  }
}

/**
 * Thrown by `GuildMemberManager#request` when Discord stops sending the chunks of the requested members.
 *
 * @remarks
 * The request is dropped: chunks arriving later still update the cache and emit `guildMembersChunk`.
 */
export class GuildMembersTimeoutError extends Error {
  /**
   * The ID of the guild whose members were requested.
   */
  public readonly guildId: string;

  /**
   * The nonce of the request.
   */
  public readonly nonce: string;

  /**
   * The timeout that was exceeded, in milliseconds.
   */
  public readonly timeout: number;

  public constructor(guildId: string, nonce: string, timeout: number) {
    super(`Requesting the members of guild ${guildId} (${nonce}) took longer than ${timeout}ms`);
    this.name = "GuildMembersTimeoutError";
    this.guildId = guildId;
    this.nonce = nonce;
    this.timeout = timeout;
  }
}

/**
 * Thrown by `GuildMemberManager#request` when Discord answers with `RATE_LIMITED` instead of the members' chunks.
 */
export class GuildMembersRateLimitError extends Error {
  /**
   * The ID of the guild whose members were requested.
   */
  public readonly guildId: string;

  /**
   * The nonce of the request.
   */
  public readonly nonce: string;

  /**
   * How long to wait before requesting the members again, in milliseconds.
   */
  public readonly retryAfter: number;

  public constructor(guildId: string, nonce: string, retryAfter: number) {
    super(
      `Requesting the members of guild ${guildId} (${nonce}) is rate limited, retry after ${retryAfter}ms`,
    );
    this.name = "GuildMembersRateLimitError";
    this.guildId = guildId;
    this.nonce = nonce;
    this.retryAfter = retryAfter;
  }
}
