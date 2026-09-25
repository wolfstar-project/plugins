import { GatewayDispatchEvents, type GatewayDispatchPayload } from "discord-api-types/v10";

/**
 * A snapshot of a {@link DispatchQueue}.
 */
export interface DispatchQueueStats {
  /**
   * The dispatches received but not processed yet, across every shard.
   */
  pending: number;
  /**
   * The partitions currently holding at least one pending dispatch.
   */
  partitions: number;
}

interface ShardQueue {
  // The last dispatch every partition must wait for, e.g. `READY`.
  barrier: Promise<void>;
  partitions: Map<string, Promise<void>>;
}

const GuildEvents: ReadonlySet<string> = new Set([
  GatewayDispatchEvents.GuildCreate,
  GatewayDispatchEvents.GuildUpdate,
  GatewayDispatchEvents.GuildDelete,
]);

/**
 * Gets the partition a dispatch is processed in: its guild, else its channel (direct messages), else `null`.
 *
 * @remarks
 * A `null` partition is a barrier: the dispatch waits for every pending dispatch of its shard, and every later one
 * waits for it. `READY`, `RESUMED`, and user-level dispatches such as `USER_UPDATE` are barriers.
 *
 * @param payload The dispatch payload.
 */
export function dispatchPartition(payload: GatewayDispatchPayload): string | null {
  const data = payload.d as { guild_id?: string; channel_id?: string; id?: string } | null;
  if (!data || typeof data !== "object") return null;
  if (data.guild_id) return `guild:${data.guild_id}`;
  if (GuildEvents.has(payload.t) && data.id) return `guild:${data.id}`;
  if (data.channel_id) return `channel:${data.channel_id}`;
  // Direct message channels are the only channels created or deleted without a guild.
  if (payload.t.startsWith("CHANNEL_") && data.id) return `channel:${data.id}`;
  return null;
}

/**
 * Runs tasks in order within a partition, and partitions of the same shard concurrently.
 *
 * @remarks
 * An asynchronous cache (Redis) would otherwise let a later dispatch of a guild finish before an earlier one. Guilds
 * are independent, so a slow guild does not hold the others back. Tasks must never reject: the queue has no way to
 * report their errors.
 */
export class DispatchQueue {
  readonly #shards = new Map<number, ShardQueue>();
  // The shard each guild's dispatches come from, for the tasks the client queues on its own.
  readonly #guildShards = new Map<string, number>();
  #pending = 0;

  /**
   * Queues a task.
   *
   * @param shardId The shard the dispatch was received on.
   * @param partition The partition from {@link dispatchPartition}, `null` for a barrier.
   * @param task The task to run once the previous task of its partition is done.
   * @returns The task's completion.
   */
  public enqueue(
    shardId: number,
    partition: string | null,
    task: () => Promise<void>,
  ): Promise<void> {
    const shard = this.shard(shardId);
    this.#pending++;
    if (partition?.startsWith("guild:")) this.#guildShards.set(partition, shardId);

    const previous =
      partition === null
        ? Promise.all([shard.barrier, ...shard.partitions.values()])
        : (shard.partitions.get(partition) ?? shard.barrier);
    const run = previous.then(task).finally(() => {
      this.#pending--;
      if (partition !== null && shard.partitions.get(partition) === run) {
        shard.partitions.delete(partition);
      }
    });

    if (partition === null) {
      // Every pending partition is covered by the barrier from now on.
      shard.barrier = run;
      shard.partitions.clear();
    } else {
      shard.partitions.set(partition, run);
    }

    return run;
  }

  /**
   * Queues a task in a guild's partition, on the shard the guild's dispatches come from: a cache write the client
   * makes on its own then stays in order with them. Before any dispatch of the guild, there is nothing to order it
   * with, and it runs on shard 0.
   *
   * @param guildId The ID of the guild.
   * @param task The task to run once the previous task of the guild is done.
   */
  public enqueueGuild(guildId: string, task: () => Promise<void>): Promise<void> {
    const partition = `guild:${guildId}`;
    return this.enqueue(this.#guildShards.get(partition) ?? 0, partition, task);
  }

  /**
   * Resolves once every task queued so far has run.
   */
  public async idle(): Promise<void> {
    await Promise.all(
      [...this.#shards.values()].flatMap((shard) => [shard.barrier, ...shard.partitions.values()]),
    );
  }

  /**
   * A snapshot of the pending work.
   */
  public get stats(): DispatchQueueStats {
    let partitions = 0;
    for (const shard of this.#shards.values()) partitions += shard.partitions.size;
    return { pending: this.#pending, partitions };
  }

  private shard(shardId: number): ShardQueue {
    let shard = this.#shards.get(shardId);
    if (!shard) {
      shard = { barrier: Promise.resolve(), partitions: new Map() };
      this.#shards.set(shardId, shard);
    }

    return shard;
  }
}
