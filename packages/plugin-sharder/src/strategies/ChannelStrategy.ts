/**
 * What a shard is told about itself when spawned, read back by {@link ShardClient}.
 */
export interface ShardContext {
  /**
   * The ID of the shard: the index of its channel in the manager.
   */
  id: number;
  /**
   * The IDs of the gateway shards the shard connects.
   */
  shards: readonly number[];
  /**
   * The total number of gateway shards, across every shard (and every manager).
   */
  shardCount: number;
  /**
   * How long the ready shard may go without a ping from its manager, in milliseconds, before
   * `managerUnresponsive`; `null` when the manager does not ping.
   */
  pingTimeout: number | null;
  /**
   * How long the shard waits for the replies of its requests by default, in milliseconds.
   */
  requestTimeout: number;
  /**
   * The name of the manager's message handler.
   */
  messageHandler: string;
  /**
   * The names of the manager's message transformers, in order.
   */
  transformers: readonly string[];
  /**
   * How the shard talks to its parent: the process IPC channel, or its worker thread port. Set by the strategy.
   */
  transport?: "process" | "worker";
}

/**
 * The callbacks a {@link ChannelStrategy} reports a spawned shard's activity through.
 */
export interface ShardTransportEvents {
  message(data: unknown): void;
  /**
   * The shard stopped. Called once per spawn.
   */
  exit(code: number | null): void;
  /**
   * The shard failed, e.g. a worker that could not start.
   */
  error(error: unknown): void;
}

/**
 * What a strategy spawns a shard with, on top of its context.
 */
export interface SpawnOptions {
  /**
   * Environment variables for the shard, e.g. `DISCORD_TOKEN`.
   */
  env: Record<string, string>;
}

/**
 * The manager's end of the channel to one spawned shard.
 */
export interface ShardTransport {
  send(data: unknown): Promise<void>;
  /**
   * Stops the shard, resolving once it stopped.
   */
  kill(): Promise<void>;
  /**
   * The ID of the shard's process, for observability.
   */
  readonly pid?: number | null;
  /**
   * The ID of the shard's worker thread.
   */
  readonly threadId?: number | null;
  /**
   * The host running the shard, for strategies spawning shards elsewhere.
   */
  readonly host?: string | null;
}

/**
 * Spawns shards: as child processes, cluster workers, worker threads, on other machines, or anything else. The
 * sharder RFC's channel strategy.
 */
export interface ChannelStrategy {
  /**
   * The name of the strategy in the registry, see {@link registerStrategy}.
   */
  readonly name: string;
  /**
   * Prepares the strategy before the first spawn, e.g. starts listening for proxies.
   */
  init?(): Promise<void>;
  /**
   * Releases what the strategy holds, once every shard is closed.
   */
  destroy?(): Promise<void>;
  spawn(context: ShardContext, events: ShardTransportEvents, options: SpawnOptions): ShardTransport;
}

/**
 * The environment variable carrying the {@link ShardContext} of a shard.
 */
export const ShardContextVariable = "WOLFSTAR_SHARDER";

/**
 * Serializes a shard's context for its environment or worker data.
 *
 * @internal
 */
export function encodeContext(context: ShardContext): string {
  return JSON.stringify(context);
}
