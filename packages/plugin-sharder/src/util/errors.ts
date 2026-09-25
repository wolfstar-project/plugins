/**
 * What a sharder operation fails with: the `E` of the `try*` methods' `Result<T, E>`.
 */
export type ShardError =
  | ShardRequestError
  | ShardRequestTimeoutError
  | ShardUnavailableError
  | ShardSpawnError
  | Error;

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
 * A shard stopped, is not ready in time, or does not exist.
 */
export class ShardUnavailableError extends Error {
  public readonly channelId: number;

  public constructor(channelId: number, reason: string) {
    super(`Shard ${channelId} is unavailable: ${reason}`);
    this.name = "ShardUnavailableError";
    this.channelId = channelId;
  }
}

/**
 * A shard failed before it was ready: its process exited, or its worker could not start. The sharder RFC's `error`
 * signal.
 */
export class ShardSpawnError extends Error {
  public readonly channelId: number;
  /**
   * The exit code, when the shard exited.
   */
  public readonly code: number | null;

  public constructor(channelId: number, code: number | null, cause?: unknown) {
    super(
      cause instanceof Error
        ? `Shard ${channelId} failed to start: ${cause.message}`
        : `Shard ${channelId} exited with code ${code} before it was ready`,
      { cause },
    );
    this.name = "ShardSpawnError";
    this.channelId = channelId;
    this.code = code;
  }
}
