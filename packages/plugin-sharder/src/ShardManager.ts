import { EventEmitter } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";
import { Shard } from "./Shard.js";
import { JsonMessageHandler, type MessageHandler } from "./messages/MessageHandler.js";
import type { MessageTransformer } from "./messages/MessageTransformer.js";
import { PacketCodec, type ShardStatus, type ShardTarget } from "./messages/protocol.js";
import type { ChannelStrategy } from "./strategies/ChannelStrategy.js";
import { ShardUnavailableError } from "./util/errors.js";
import type { RequestHandler, RequestOptions } from "./util/requests.js";
import { shardIdForGuild } from "./util/shards.js";

/**
 * The options of a {@link ShardManager}.
 */
export interface ShardManagerOptions {
  /**
   * How to spawn the shards: {@link ForkStrategy}, {@link ClusterStrategy}, {@link WorkerStrategy}, or a custom one.
   */
  strategy: ChannelStrategy;
  /**
   * The gateway shards to connect: a number spawns one shard per gateway shard, an array spawns one shard per entry,
   * connecting that many gateway shards each.
   *
   * @example
   * ```ts
   * // 9 shards, connecting one gateway shard each.
   * new ShardManager({ strategy, shards: 9 });
   * // 3 shards, connecting 3 gateway shards each: 0-2, 3-5 and 6-8.
   * new ShardManager({ strategy, shards: [3, 3, 3] });
   * ```
   */
  shards: number | readonly number[];
  /**
   * How many times in a row a crashing shard is respawned, `-1` or `Infinity` for no limit. The count resets once the
   * shard is ready again.
   *
   * @default -1
   */
  respawns?: number;
  spawn?: {
    /**
     * How long to wait after a shard is ready before spawning the next one, in milliseconds. Discord allows one
     * gateway identify per 5 seconds (per `max_concurrency` bucket), across every process.
     *
     * @default 5_000
     */
    delay?: number;
    /**
     * How long a shard has to signal that it is ready, in milliseconds. Past it, it is killed and respawned.
     *
     * @default 30_000
     */
    timeout?: number;
  };
  ping?: {
    /**
     * How often the shards ping their manager, in milliseconds.
     *
     * @default 45_000
     */
    interval?: number;
    /**
     * How long a ready shard may go without pinging, in milliseconds, before it is deemed unresponsive: emitted as
     * `shardUnresponsive`, or restarted when nothing listens to it.
     *
     * @default 60_000
     */
    timeout?: number;
  };
  /**
   * How long requests wait for their reply by default, in milliseconds.
   *
   * @default ping.timeout
   */
  requestTimeout?: number;
  /**
   * How messages are serialized. The shards must use the same.
   *
   * @default new JsonMessageHandler()
   */
  messageHandler?: MessageHandler;
  /**
   * How serialized messages are transformed (compressed, encrypted, ...). The shards must use the same, in the same
   * order.
   *
   * @default []
   */
  transformers?: readonly MessageTransformer[];
}

/**
 * The events of a {@link ShardManager}.
 */
export interface ShardManagerEvents {
  /**
   * A shard was spawned.
   */
  shardCreate: [shard: Shard];
  /**
   * A shard signalled a new status, or stopped (`Idle`).
   */
  shardStatus: [shard: Shard, status: ShardStatus];
  shardReady: [shard: Shard];
  /**
   * A shard pinged its manager; `delay` is how long the ping took to arrive, in milliseconds.
   */
  shardPing: [shard: Shard, delay: number];
  /**
   * A ready shard did not ping in time. Without listeners, the shard is restarted.
   */
  shardUnresponsive: [shard: Shard];
  /**
   * A shard is about to be spawned again: it asked for it, crashed, or was restarted.
   */
  shardRestart: [shard: Shard];
  /**
   * A shard's process or thread stopped.
   */
  shardExit: [shard: Shard, code: number | null];
  /**
   * A shard was closed by its manager.
   */
  shardDestroy: [shard: Shard];
  /**
   * A shard sent data that could not be read. Without listeners, it is logged with `console.error`.
   */
  shardInvalidMessage: [shard: Shard, error: unknown];
  /**
   * A shard sent a message to the manager.
   */
  message: [body: any, shard: Shard];
  error: [error: unknown];
}

/**
 * Spawns shards, keeps them alive, and carries messages between them.
 *
 * @remarks
 * Follows discord.js's sharder RFC (discordjs/discord.js#8084): a "shard" is a process, cluster worker, or worker
 * thread, which may connect several gateway shards. The manager is agnostic of the bot: a shard runs any script using
 * {@link ShardClient}, e.g. a `GatewayClient` spreading {@link ShardClient.gatewayOptions} into its options.
 *
 * @example
 * ```ts
 * const manager = new ShardManager({
 *   strategy: new ForkStrategy({ path: new URL("./bot.js", import.meta.url) }),
 *   shards: [4, 4],
 * });
 * manager.setRequestHandler((body, { shard }) => ...);
 * await manager.spawn();
 * const guilds = await manager.broadcastRequest({ type: "guildCount" });
 * ```
 */
export class ShardManager extends EventEmitter<ShardManagerEvents> {
  public readonly strategy: ChannelStrategy;

  /**
   * The shards, by ID.
   */
  public readonly shards: readonly Shard[];

  /**
   * The total number of gateway shards, across every shard.
   */
  public readonly shardCount: number;

  /**
   * How many times in a row a crashing shard is respawned, `-1` for no limit.
   */
  public readonly respawns: number;
  public readonly spawnDelay: number;
  public readonly spawnTimeout: number;
  public readonly pingInterval: number;
  public readonly pingTimeout: number;
  public readonly requestTimeout: number;

  /**
   * @internal
   */
  public readonly codec: PacketCodec;

  /**
   * @internal
   */
  public requestHandler: RequestHandler<{ shard: Shard }> | null = null;

  #queue: Promise<void> = Promise.resolve();

  public constructor(options: ShardManagerOptions) {
    super();
    this.strategy = options.strategy;
    this.respawns = resolveRespawns(options.respawns);
    this.spawnDelay = options.spawn?.delay ?? 5_000;
    this.spawnTimeout = options.spawn?.timeout ?? 30_000;
    this.pingInterval = options.ping?.interval ?? 45_000;
    this.pingTimeout = options.ping?.timeout ?? 60_000;
    this.requestTimeout = options.requestTimeout ?? this.pingTimeout;
    this.codec = new PacketCodec(
      options.messageHandler ?? new JsonMessageHandler(),
      options.transformers ?? [],
    );

    const layout =
      typeof options.shards === "number"
        ? Array.from({ length: options.shards }, () => 1)
        : options.shards;
    if (layout.length === 0 || layout.some((count) => !Number.isSafeInteger(count) || count < 1)) {
      throw new RangeError("shards must be a positive integer, or a list of positive integers");
    }

    const shards: Shard[] = [];
    let next = 0;
    for (const [id, count] of layout.entries()) {
      shards.push(
        new Shard(
          this,
          id,
          Array.from({ length: count }, (_, index) => next + index),
        ),
      );
      next += count;
    }

    this.shards = shards;
    this.shardCount = next;
  }

  /**
   * Spawns every shard, one after the other, each waiting for the previous one to be ready plus the spawn delay. A
   * shard not ready in time is killed and tried again at the end of the queue, within the respawn budget.
   */
  public async spawn(): Promise<void> {
    await Promise.all(this.shards.map((shard) => this.#startWithRetries(shard)));
  }

  /**
   * Gets the shard connecting a gateway shard.
   *
   * @param gatewayShardId The ID of the gateway shard.
   */
  public shardFor(gatewayShardId: number): Shard | undefined {
    return this.shards.find((shard) => shard.shards.includes(gatewayShardId));
  }

  /**
   * Gets the shard receiving the events of a guild.
   *
   * @param guildId The ID of the guild.
   */
  public shardForGuild(guildId: string): Shard {
    return this.shardFor(shardIdForGuild(guildId, this.shardCount))!;
  }

  /**
   * Sets the handler answering the requests the shards send to the manager.
   *
   * @param handler The handler; its return value is the reply.
   */
  public setRequestHandler(handler: RequestHandler<{ shard: Shard }> | null): this {
    this.requestHandler = handler;
    return this;
  }

  /**
   * Sends a message to a shard, emitted as `message` by its {@link ShardClient}.
   *
   * @param shardId The ID of the shard.
   * @param body The message.
   */
  public send(shardId: number, body: unknown): Promise<void> {
    return this.#shard(shardId).send(body);
  }

  /**
   * Sends a request to a shard, answered by its {@link ShardClient}'s request handler.
   *
   * @param shardId The ID of the shard.
   * @param body The request.
   * @param options The timeout and abort signal of the request.
   */
  public request<Reply = unknown>(
    shardId: number,
    body: unknown,
    options?: RequestOptions,
  ): Promise<Reply> {
    return this.#shard(shardId).request<Reply>(body, options);
  }

  /**
   * Sends a message to every shard.
   *
   * @param body The message.
   */
  public async broadcast(body: unknown): Promise<void> {
    await Promise.all(this.shards.map((shard) => shard.send(body)));
  }

  /**
   * Sends a request to every shard, like discord.js's `broadcastEval` without the `eval`.
   *
   * @param body The request.
   * @param options The timeout and abort signal of every request.
   * @returns The replies, by shard ID.
   */
  public broadcastRequest<Reply = unknown>(
    body: unknown,
    options?: RequestOptions,
  ): Promise<Reply[]> {
    return Promise.all(this.shards.map((shard) => shard.request<Reply>(body, options)));
  }

  /**
   * Restarts a shard.
   *
   * @param shardId The ID of the shard.
   */
  public async restart(shardId: number): Promise<void> {
    const shard = this.#shard(shardId);
    await shard.close();
    this.emit("shardRestart", shard);
    await this.#startWithRetries(shard, true);
  }

  /**
   * Restarts every shard, one after the other, with the spawn delay between them.
   */
  public async restartAll(): Promise<void> {
    for (const shard of this.shards) await this.restart(shard.id);
  }

  /**
   * Closes every shard for good.
   */
  public async destroy(): Promise<void> {
    await Promise.all(this.shards.map((shard) => shard.close()));
  }

  /**
   * Carries a message a shard sends to another shard, or to every shard.
   *
   * @internal
   */
  public async route(body: unknown, to: ShardTarget, from: number): Promise<void> {
    if (to === "all") await Promise.all(this.shards.map((shard) => shard.send(body, from)));
    else await this.#shard(to).send(body, from);
  }

  /**
   * Carries a request a shard sends to another shard, or to every shard.
   *
   * @internal
   */
  public forward(
    body: unknown,
    to: ShardTarget,
    from: number,
    options: RequestOptions,
  ): Promise<unknown> {
    return to === "all"
      ? Promise.all(this.shards.map((shard) => shard.request(body, options, from)))
      : this.#shard(to).request(body, options, from);
  }

  /**
   * Starts a shard again after it crashed or asked to be restarted.
   *
   * @internal
   */
  public respawn(shard: Shard): void {
    void this.#startWithRetries(shard).catch((error: unknown) => this.reportError(error));
  }

  /**
   * @internal
   */
  public reportError(error: unknown): void {
    if (this.listenerCount("error") > 0) this.emit("error", error);
    else console.error(error);
  }

  /**
   * @internal
   */
  public reportInvalidMessage(shard: Shard, error: unknown): void {
    if (this.listenerCount("shardInvalidMessage") > 0)
      this.emit("shardInvalidMessage", shard, error);
    else console.error(`Shard ${shard.id} sent an invalid message:`, error);
  }

  // `force` starts a shard closed for a restart; otherwise, a shard closed meanwhile is left alone.
  async #startWithRetries(shard: Shard, force = false): Promise<void> {
    for (let attempt = 0; ; ++attempt) {
      try {
        await this.#enqueue(async () => {
          if ((!force && shard.stopped) || shard.running) return;
          await shard.start();
        });
        return;
      } catch (error) {
        if (shard.stopped || (this.respawns !== -1 && attempt >= this.respawns)) throw error;
      }
    }
  }

  // Shards start one at a time, with the spawn delay after each, so their gateway identifies never overlap.
  #enqueue(task: () => Promise<void>): Promise<void> {
    const run = this.#queue.then(task);
    this.#queue = run.then(
      () => sleep(this.spawnDelay),
      () => sleep(this.spawnDelay),
    );
    return run;
  }

  #shard(shardId: number): Shard {
    const shard = this.shards[shardId];
    if (!shard) throw new ShardUnavailableError(shardId, "there is no such shard");
    return shard;
  }
}

function resolveRespawns(respawns: number | undefined): number {
  if (respawns === undefined || respawns === -1 || respawns === Number.POSITIVE_INFINITY) return -1;
  if (!Number.isSafeInteger(respawns) || respawns < 0) {
    throw new RangeError("respawns must be a non-negative integer, -1, or Infinity");
  }

  return respawns;
}
