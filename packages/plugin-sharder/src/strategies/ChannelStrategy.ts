import type { ChannelData } from "../messages/MessageHandler.js";

/**
 * What a shard is told about itself when spawned. {@link ShardClient} reads it back.
 */
export interface ShardContext {
  /**
   * The ID of the shard, its index in the manager.
   */
  id: number;
  /**
   * The IDs of the gateway shards the shard connects.
   */
  shards: readonly number[];
  /**
   * The total number of gateway shards, across every shard.
   */
  shardCount: number;
  /**
   * How often the shard pings its manager, in milliseconds.
   */
  pingInterval: number;
  /**
   * How long the shard waits for the replies of its requests by default, in milliseconds.
   */
  requestTimeout: number;
  /**
   * How the shard talks to its manager: through the process IPC channel, or its worker thread port.
   */
  transport: "process" | "worker";
}

/**
 * The callbacks a {@link ChannelStrategy} reports a spawned shard's activity through.
 */
export interface ShardTransportEvents {
  message(data: ChannelData): void;
  /**
   * The shard stopped. Called once per spawn.
   */
  exit(code: number | null): void;
  error(error: unknown): void;
}

/**
 * The manager's end of the channel to one spawned shard.
 */
export interface ShardTransport {
  send(data: ChannelData): Promise<void>;
  /**
   * Stops the shard, resolving once it stopped.
   */
  kill(): Promise<void>;
}

/**
 * Spawns shards: as child processes, cluster workers, worker threads, or anything else.
 */
export interface ChannelStrategy {
  /**
   * How the spawned shards talk to their manager, see {@link ShardContext.transport}.
   */
  readonly transport: ShardContext["transport"];
  spawn(context: ShardContext, events: ShardTransportEvents): ShardTransport;
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
