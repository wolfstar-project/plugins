/**
 * The handler of a request threw, or there was none: the error is the remote one, rebuilt.
 */
export class ShardRequestError extends Error {
  /**
   * The name of the remote error, e.g. `TypeError`.
   */
  public readonly remoteName: string;

  public constructor(remoteName: string, message: string) {
    super(message);
    this.name = "ShardRequestError";
    this.remoteName = remoteName;
  }
}

/**
 * A request got no reply in time. The other side was told to abort it.
 */
export class ShardRequestTimeoutError extends Error {
  public readonly timeout: number;

  public constructor(timeout: number) {
    super(`The request got no reply within ${timeout}ms`);
    this.name = "ShardRequestTimeoutError";
    this.timeout = timeout;
  }
}

/**
 * A shard stopped, or never became ready, before a message could reach it.
 */
export class ShardUnavailableError extends Error {
  public readonly shardId: number;

  public constructor(shardId: number, reason: string) {
    super(`Shard ${shardId} is unavailable: ${reason}`);
    this.name = "ShardUnavailableError";
    this.shardId = shardId;
  }
}
