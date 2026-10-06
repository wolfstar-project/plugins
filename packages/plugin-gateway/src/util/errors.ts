import { GatewayError } from "../errors/GatewayError.js";

/**
 * Emitted as an `error` when a dispatch takes longer than `GatewayClientOptions.dispatchTimeout` to process.
 *
 * @remarks
 * The dispatch is not cancelled: it keeps running, and later dispatches of its partition keep waiting for it, so the
 * event order is preserved. The error only reports that the partition is stuck, usually on a slow or unreachable
 * cache.
 */
export class DispatchTimeoutError extends GatewayError<"DispatchTimeout"> {
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
    super("DispatchTimeout", type, shardId, partition, timeout);
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
export class GuildMembersTimeoutError extends GatewayError<"GuildMembersTimeout"> {
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
    super("GuildMembersTimeout", guildId, nonce, timeout);
    this.guildId = guildId;
    this.nonce = nonce;
    this.timeout = timeout;
  }
}

/**
 * Thrown by `ChannelManager#requestInfo` when Discord does not answer with the `CHANNEL_INFO` of the guild.
 *
 * @remarks
 * The request is dropped: a reply arriving later still updates the cache and emits `channelInfo`. When another request
 * for the guild is queued, that reply also resolves it, as the reply carries no nonce to tell them apart.
 */
export class GuildChannelInfoTimeoutError extends GatewayError<"GuildChannelInfoTimeout"> {
  /**
   * The ID of the guild whose channel info was requested.
   */
  public readonly guildId: string;

  /**
   * The timeout that was exceeded, in milliseconds.
   */
  public readonly timeout: number;

  public constructor(guildId: string, timeout: number) {
    super("GuildChannelInfoTimeout", guildId, timeout);
    this.guildId = guildId;
    this.timeout = timeout;
  }
}

/**
 * Thrown by `GuildMemberManager#request` when Discord answers with `RATE_LIMITED` instead of the members' chunks.
 */
export class GuildMembersRateLimitError extends GatewayError<"GuildMembersRateLimited"> {
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
    super("GuildMembersRateLimited", guildId, nonce, retryAfter);
    this.guildId = guildId;
    this.nonce = nonce;
    this.retryAfter = retryAfter;
  }
}

/**
 * Emitted as an `error` when `GatewayClientOptions.sessionStore` fails to read or write the session of a shard.
 *
 * @remarks
 * Neither failure stops the shard: a failed (or timed out) read identifies instead of resuming, and a failed write
 * only means the session may not be resumed after a restart. The store's error is the `cause`.
 */
export class GatewaySessionStoreError extends GatewayError<"SessionStoreFailed"> {
  /**
   * Whether the store failed to read (`"get"`) or write (`"set"`) the session.
   */
  public readonly operation: "get" | "set";

  /**
   * The shard whose session was read or written.
   */
  public readonly shardId: number;

  public constructor(operation: "get" | "set", shardId: number, cause: unknown) {
    super("SessionStoreFailed", operation, shardId);
    this.cause = cause;
    this.operation = operation;
    this.shardId = shardId;
  }
}
