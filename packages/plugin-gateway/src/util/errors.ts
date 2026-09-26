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
