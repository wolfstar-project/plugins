import type { Result } from "@sapphire/result";
import { EventEmitter } from "node:events";
import { availableParallelism } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { ShardChannel, type ShardRestartOptions } from "./ShardChannel.js";
import type { ShardPingOptions } from "./ShardPing.js";
import { resolveMessageHandler, type MessageHandler } from "./messages/MessageHandler.js";
import {
  resolveMessageTransformer,
  type MessageTransformer,
} from "./messages/MessageTransformer.js";
import {
  PacketCodec,
  type ControlRequest,
  type ShardStatus,
  type ShardTarget,
  type SystemCall,
} from "./messages/protocol.js";
import type { ChannelStrategy } from "./strategies/ChannelStrategy.js";
import { resolveStrategy } from "./strategies/registry.js";
import { ShardUnavailableError, type ShardError } from "./util/errors.js";
import {
  GatewayInformationCache,
  fetchGatewayInformation,
  resolveRecommendedShardCount,
  shardIdForGuild,
  type GatewayInformation,
  type RecommendedShardCountOptions,
} from "./util/gateway.js";
import { IdentifyQueue } from "./util/IdentifyQueue.js";
import {
  serializeSettled,
  settledToResults,
  toResult,
  type BroadcastRequestOptions,
  type RequestHandler,
  type RequestOptions,
} from "./util/requests.js";
import { Supervisor, type SupervisorOptions } from "./util/Supervisor.js";

/**
 * How the gateway shards are laid out across shards.
 */
export interface ShardLayoutOptions {
  /**
   * The layout: a number spawns one shard per gateway shard, an array spawns one shard per entry connecting that
   * many gateway shards, and `"auto"` splits the gateway shards across `clusters` shards.
   *
   * @default "auto"
   * @example
   * ```ts
   * // 9 shards, connecting one gateway shard each.
   * new ShardManager({ shards: 9 });
   * // 3 shards, connecting 3 gateway shards each: 0-2, 3-5 and 6-8.
   * new ShardManager({ shards: [3, 3, 3] });
   * // Discord's recommended count, split across 4 shards.
   * new ShardManager({ shards: "auto", clusters: 4 });
   * ```
   */
  shards?: number | readonly number[] | "auto";
  /**
   * The total number of gateway shards, across every manager: `"auto"` is Discord's recommendation. Defaults to the
   * number of gateway shards of this manager.
   */
  totalShards?: number | "auto";
  /**
   * The gateway shards this manager spawns, when several managers split them. Defaults to all of them.
   */
  shardList?: readonly number[];
  /**
   * How many shards to split the gateway shards across, with `shards: "auto"`.
   *
   * @default os.availableParallelism()
   */
  clusters?: number;
  /**
   * How Discord's recommended count is turned into the total, with `"auto"`.
   */
  recommended?: RecommendedShardCountOptions;
}

/**
 * The options of a {@link ShardManager}.
 */
export interface ShardManagerOptions extends ShardLayoutOptions {
  /**
   * How to spawn the shards: a {@link ChannelStrategy}, or the name of a registered one (`"fork"`, `"cluster"`,
   * `"worker"`, `"network"`), built with `strategyOptions`.
   *
   * @default "fork"
   */
  strategy?: ChannelStrategy | string;
  /**
   * The options of a strategy given by name.
   */
  strategyOptions?: unknown;
  /**
   * The bot token: used for `"auto"` layouts and `GET /gateway/bot`, and passed to the shards as `DISCORD_TOKEN`.
   *
   * @default process.env.DISCORD_TOKEN
   */
  token?: string;
  /**
   * How `GET /gateway/bot` is fetched and cached. The shards get it from the manager, so it is fetched once for all.
   */
  gatewayInformation?: {
    /**
     * Fetches it, instead of requesting Discord with the token.
     */
    fetch?: () => Promise<GatewayInformation>;
    /**
     * How long to reuse it, in milliseconds; the session start limit is kept up to date meanwhile.
     *
     * @default 86_400_000
     */
    ttl?: number;
  };
  /**
   * How the identifies of the gateway shards are paced, across every shard. See {@link ShardClient.identifyThrottler}.
   */
  identify?: {
    /**
     * How many gateway shards may identify at once: `"auto"` is the `max_concurrency` of `GET /gateway/bot`, or `1`
     * without a token.
     *
     * @default "auto"
     */
    concurrency?: number | "auto";
    /**
     * How long a concurrency bucket waits between identifies, in milliseconds.
     *
     * @default 5_000
     */
    delay?: number;
  };
  /**
   * How crashing shards are restarted.
   */
  supervisor?: SupervisorOptions;
  spawn?: {
    /**
     * How long to wait after a shard is ready before spawning the next one, in milliseconds. With
     * {@link ShardClient.identifyThrottler} pacing the identifies, it can be `0`.
     *
     * @default 5_000
     */
    delay?: number;
    /**
     * How long a shard has to signal that it is ready, in milliseconds. Past it, it is killed and spawned again at
     * the end of the queue.
     *
     * @default 30_000
     */
    timeout?: number;
    /**
     * How long a shard is expected to take to be ready, in milliseconds. Defaults to the average of the shards
     * spawned so far. A shard slower than the estimate (plus the margin) is emitted as `shardSlowStart`, and a request
     * for a starting shard that is not expected to be ready before its timeout is rejected right away.
     */
    readyHint?: number;
    /**
     * The margin of error of the estimate, as a fraction of it.
     *
     * @default 0.1
     */
    readyHintMargin?: number;
  };
  ping?: ShardPingOptions;
  /**
   * How long requests wait for their reply by default, in milliseconds.
   *
   * @default ping.timeout
   */
  requestTimeout?: number;
  /**
   * How messages are serialized: a handler, or the name of a registered one. The shards build the same one.
   *
   * @default "json"
   */
  messageHandler?: MessageHandler | string;
  /**
   * How serialized messages are transformed (compressed, encrypted, ...), in order: transformers, or names of
   * registered ones. The shards build the same ones.
   *
   * @default []
   */
  transformers?: readonly (MessageTransformer | string)[];
}

/**
 * The events of a {@link ShardManager}.
 */
export interface ShardManagerEvents {
  /**
   * A shard was spawned.
   */
  shardCreate: [channel: ShardChannel];
  /**
   * A shard signalled a new status, or stopped (`Idle`).
   */
  shardStatus: [channel: ShardChannel, status: ShardStatus];
  shardReady: [channel: ShardChannel];
  shardDisconnect: [channel: ShardChannel];
  shardReconnecting: [channel: ShardChannel];
  /**
   * A shard answered a ping; `latency` is the round trip, in milliseconds.
   */
  shardPing: [channel: ShardChannel, latency: number];
  /**
   * A ready shard did not answer the pings in time. Without listeners, it is restarted.
   */
  shardUnresponsive: [channel: ShardChannel];
  /**
   * A shard takes longer than the estimate (plus its margin) to be ready.
   */
  shardSlowStart: [channel: ShardChannel, elapsed: number, estimate: number];
  /**
   * A shard is about to be spawned again: it asked for it, crashed, or was restarted.
   */
  shardRestart: [channel: ShardChannel];
  /**
   * A shard's process or thread stopped.
   */
  shardExit: [channel: ShardChannel, code: number | null];
  /**
   * A shard was closed by its manager.
   */
  shardDestroy: [channel: ShardChannel];
  /**
   * A shard failed: it exited before it was ready (a {@link ShardSpawnError}), or its strategy reported an error.
   * Without listeners, it goes to `error`.
   */
  shardError: [channel: ShardChannel, error: unknown];
  /**
   * A shard crashed more often than the supervisor tolerates, and is not restarted anymore. Without listeners, it
   * goes to `error`.
   */
  shardGiveUp: [channel: ShardChannel, crashes: number];
  /**
   * A shard sent data that could not be read. Without listeners, it is logged with `console.error`.
   */
  shardInvalidMessage: [channel: ShardChannel, error: unknown];
  /**
   * A shard sent a message to the manager.
   */
  message: [body: any, channel: ShardChannel];
  /**
   * Without listeners, errors are logged with `console.error`.
   */
  error: [error: unknown];
}

/**
 * Spawns shards, keeps them alive, and carries messages between them.
 *
 * @remarks
 * Follows discord.js's sharder RFC (discordjs/discord.js#8084): a "shard" is a process, cluster worker, worker
 * thread, or remote process, which may connect several gateway shards, and the manager talks to each through a
 * {@link ShardChannel}. The manager is agnostic of the bot: a shard runs any script using {@link ShardClient}.
 *
 * @example
 * ```ts
 * const manager = new ShardManager({ strategy: new ForkStrategy({ path: "./bot.js" }), clusters: 4 });
 * manager.setRequestHandler((body, { channel }) => ...);
 * await manager.spawn();
 * const guilds = await manager.broadcastRequest({ type: "guildCount" });
 * ```
 */
export class ShardManager extends EventEmitter<ShardManagerEvents> {
  public readonly strategy: ChannelStrategy;

  /**
   * The channels to the shards, by ID. Empty until {@link ShardManager.spawn} for `"auto"` layouts.
   */
  public channels: readonly ShardChannel[] = [];

  /**
   * The total number of gateway shards, `0` until resolved for `"auto"` layouts.
   */
  public shardCount = 0;

  public readonly spawnDelay: number;
  public readonly spawnTimeout: number;
  public readonly readyHint: number | null;
  public readonly readyHintMargin: number;
  public readonly requestTimeout: number;
  public readonly pingOptions: Required<ShardPingOptions>;

  /**
   * @internal
   */
  public readonly codec: PacketCodec;

  /**
   * @internal
   */
  public readonly supervisor: Supervisor;

  /**
   * @internal
   */
  public readonly spawnEnv: Record<string, string>;

  /**
   * @internal
   */
  public requestHandler: RequestHandler<{ channel: ShardChannel }> | null = null;

  readonly #layout: ShardLayoutOptions;
  readonly #token: string | null;
  readonly #gateway: GatewayInformationCache | null;
  readonly #identify: IdentifyQueue;
  readonly #identifyConcurrency: number | "auto";
  readonly #readyTimes: number[] = [];
  #queue: Promise<void> = Promise.resolve();
  #initialized = false;

  public constructor(options: ShardManagerOptions = {}) {
    super();
    this.strategy = resolveStrategy(options.strategy ?? "fork", options.strategyOptions);
    this.supervisor = new Supervisor(options.supervisor);
    this.spawnDelay = options.spawn?.delay ?? 5_000;
    this.spawnTimeout = options.spawn?.timeout ?? 30_000;
    this.readyHint = options.spawn?.readyHint ?? null;
    this.readyHintMargin = options.spawn?.readyHintMargin ?? 0.1;
    this.pingOptions = {
      interval: options.ping?.interval ?? 45_000,
      timeout: options.ping?.timeout ?? 60_000,
      delaySinceReceived: options.ping?.delaySinceReceived ?? false,
    };
    this.requestTimeout = options.requestTimeout ?? this.pingOptions.timeout;
    this.codec = new PacketCodec(
      resolveMessageHandler(options.messageHandler ?? "json"),
      (options.transformers ?? []).map(resolveMessageTransformer),
    );
    if (this.codec.handler.name === "raw" && this.codec.transformers.length > 0) {
      throw new TypeError("The raw message handler cannot be combined with transformers");
    }

    this.#token = options.token ?? process.env.DISCORD_TOKEN ?? null;
    this.spawnEnv = options.token ? { DISCORD_TOKEN: options.token } : {};
    const fetcher =
      options.gatewayInformation?.fetch ??
      (this.#token ? () => fetchGatewayInformation(this.#token!) : null);
    this.#gateway = fetcher
      ? new GatewayInformationCache(fetcher, options.gatewayInformation?.ttl ?? 86_400_000)
      : null;
    this.#identifyConcurrency = options.identify?.concurrency ?? "auto";
    this.#identify = new IdentifyQueue(
      this.#identifyConcurrency === "auto" ? 1 : this.#identifyConcurrency,
      options.identify?.delay ?? 5_000,
    );

    this.#layout = {
      shards: options.shards,
      totalShards: options.totalShards,
      shardList: options.shardList,
      clusters: options.clusters,
      recommended: options.recommended,
    };
    if (!needsGateway(this.#layout)) this.#apply(resolveLayout(this.#layout, null));
  }

  /**
   * How long a shard is expected to take to be ready: `spawn.readyHint`, or the average of the shards so far.
   */
  public get readyEstimate(): number | null {
    if (this.readyHint !== null) return this.readyHint;
    if (this.#readyTimes.length === 0) return null;
    return this.#readyTimes.reduce((sum, time) => sum + time, 0) / this.#readyTimes.length;
  }

  /**
   * Spawns every shard, one after the other, each waiting for the previous one to be ready plus the spawn delay. A
   * shard not ready in time is killed and tried again at the end of the queue, as long as the supervisor allows.
   */
  public async spawn(): Promise<void> {
    if (this.channels.length === 0) {
      const info = needsGateway(this.#layout) ? await this.fetchGatewayInformation() : null;
      this.#apply(resolveLayout(this.#layout, info));
    }

    await this.#init();
    await Promise.all(this.channels.map((channel) => this.#startWithRetries(channel)));
  }

  /**
   * Fetches `GET /gateway/bot`, cached for every shard, with its session start limit kept up to date.
   *
   * @param force Whether to skip the cache.
   */
  public async fetchGatewayInformation(force = false): Promise<GatewayInformation> {
    if (!this.#gateway) {
      throw new Error(
        "Fetching the gateway information needs a token, or gatewayInformation.fetch",
      );
    }

    return this.#gateway.get(force);
  }

  /**
   * Gets the channel to the shard connecting a gateway shard.
   *
   * @param shardId The ID of the gateway shard.
   */
  public channelFor(shardId: number): ShardChannel | undefined {
    return this.channels.find((channel) => channel.shards.includes(shardId));
  }

  /**
   * Gets the channel to the shard receiving the events of a guild.
   *
   * @param guildId The ID of the guild.
   */
  public channelForGuild(guildId: string): ShardChannel | undefined {
    return this.channelFor(shardIdForGuild(guildId, this.shardCount));
  }

  /**
   * Sets the handler answering the requests the shards send to the manager.
   *
   * @param handler The handler; its return value is the reply.
   */
  public setRequestHandler(handler: RequestHandler<{ channel: ShardChannel }> | null): this {
    this.requestHandler = handler;
    return this;
  }

  /**
   * Sends a message to a shard, emitted as `message` by its {@link ShardClient}.
   *
   * @param channelId The ID of the shard.
   * @param body The message.
   * @param options How long to wait for the shard to be ready, and an abort signal.
   */
  public send(channelId: number, body: unknown, options?: RequestOptions): Promise<void> {
    return this.#channel(channelId).send(body, options);
  }

  /**
   * Sends a request to a shard, answered by its {@link ShardClient}'s request handler.
   *
   * @param channelId The ID of the shard.
   * @param body The request.
   * @param options The timeout and abort signal of the request.
   */
  public request<Reply = unknown>(
    channelId: number,
    body: unknown,
    options?: RequestOptions,
  ): Promise<Reply> {
    return this.#channel(channelId).request<Reply>(body, options);
  }

  /**
   * Sends a message to every shard.
   *
   * @param body The message.
   * @param options How long to wait for the shards to be ready, and an abort signal.
   */
  public async broadcast(body: unknown, options?: RequestOptions): Promise<void> {
    await Promise.all(this.channels.map((channel) => channel.send(body, options)));
  }

  /**
   * Sends a request to every shard, like discord.js's `broadcastEval` without the `eval`.
   *
   * @param body The request.
   * @param options The timeout and abort signal of every request, and whether to keep partial results.
   * @returns The replies by shard ID, or with `partial`, the outcome of every request.
   */
  public broadcastRequest<Reply = unknown>(
    body: unknown,
    options: BroadcastRequestOptions & { partial: true },
  ): Promise<PromiseSettledResult<Reply>[]>;
  public broadcastRequest<Reply = unknown>(
    body: unknown,
    options?: BroadcastRequestOptions,
  ): Promise<Reply[]>;
  public broadcastRequest(body: unknown, options: BroadcastRequestOptions = {}): Promise<unknown> {
    const requests = this.channels.map((channel) => channel.request(body, options));
    return options.partial ? Promise.allSettled(requests) : Promise.all(requests);
  }

  /**
   * {@link ShardManager.send}, resolving with a `Result` rather than rejecting.
   */
  public trySend(
    channelId: number,
    body: unknown,
    options?: RequestOptions,
  ): Promise<Result<void, ShardError>> {
    return toResult(() => this.send(channelId, body, options));
  }

  /**
   * {@link ShardManager.request}, resolving with a `Result` rather than rejecting.
   */
  public tryRequest<Reply = unknown>(
    channelId: number,
    body: unknown,
    options?: RequestOptions,
  ): Promise<Result<Reply, ShardError>> {
    return toResult(() => this.request<Reply>(channelId, body, options));
  }

  /**
   * {@link ShardManager.broadcastRequest}, resolving with one `Result` per shard, by shard ID.
   */
  public async tryBroadcastRequest<Reply = unknown>(
    body: unknown,
    options?: RequestOptions,
  ): Promise<Result<Reply, ShardError>[]> {
    return settledToResults(
      await this.broadcastRequest<Reply>(body, { ...options, partial: true }),
    );
  }

  /**
   * Restarts a shard: closes it then spawns it again, or with `rolling`, spawns the new one first and closes the old
   * one once the new one is ready.
   *
   * @param channelId The ID of the shard.
   * @param options Whether to restart it rolling, and the timeout.
   */
  public async restart(channelId: number, options: ShardRestartOptions = {}): Promise<void> {
    const channel = this.#channel(channelId);
    this.emit("shardRestart", channel);
    if (options.rolling) {
      await this.#enqueue(() => channel.rollingRestart(options.timeout));
      return;
    }

    await channel.close(options.timeout);
    await this.#startWithRetries(channel, true);
  }

  /**
   * Restarts every shard, one after the other, with the spawn delay between them.
   *
   * @param options Whether to restart them rolling, and the timeout.
   */
  public async restartAll(options?: ShardRestartOptions): Promise<void> {
    for (const channel of this.channels) await this.restart(channel.id, options);
  }

  /**
   * Reshards with close to no downtime: spawns the shards of a new layout while the current ones keep running, then
   * closes the current ones once every new one is ready.
   *
   * @param layout The new layout. Left out, Discord's recommendation split across `clusters`.
   */
  public async reshard(layout: ShardLayoutOptions = { shards: "auto" }): Promise<void> {
    const info = needsGateway(layout) ? await this.fetchGatewayInformation(true) : null;
    const resolved = resolveLayout(layout, info);
    const channels = resolved.channels.map(
      (shards, id) => new ShardChannel(this, id, shards, resolved.shardCount),
    );

    try {
      await Promise.all(channels.map((channel) => this.#startWithRetries(channel)));
    } catch (error) {
      await Promise.all(channels.map((channel) => channel.close()));
      throw error;
    }

    const previous = this.channels;
    this.channels = channels;
    this.shardCount = resolved.shardCount;
    await Promise.all(previous.map((channel) => channel.close()));
  }

  /**
   * Asks the shard connecting a gateway shard to start it, through its {@link ShardClient.setShardHandler}.
   *
   * @param shardId The ID of the gateway shard.
   * @param options The timeout and abort signal of the request.
   */
  public startShard(shardId: number, options?: RequestOptions): Promise<void> {
    return this.#channelForShard(shardId).startShard(shardId, options);
  }

  /**
   * Asks the shard connecting a gateway shard to close it, through its {@link ShardClient.setShardHandler}.
   *
   * @param shardId The ID of the gateway shard.
   * @param options The timeout and abort signal of the request.
   */
  public closeShard(shardId: number, options?: RequestOptions): Promise<void> {
    return this.#channelForShard(shardId).closeShard(shardId, options);
  }

  /**
   * Closes then starts a gateway shard, see {@link ShardManager.startShard}.
   *
   * @param shardId The ID of the gateway shard.
   * @param options The timeout and abort signal of each request.
   */
  public async restartShard(shardId: number, options?: RequestOptions): Promise<void> {
    await this.closeShard(shardId, options);
    await this.startShard(shardId, options);
  }

  /**
   * Waits for a gateway shard's turn to identify, like {@link ShardClient.identifyThrottler} does from a shard.
   *
   * @param shardId The ID of the gateway shard.
   * @param signal Aborts the wait.
   */
  public async waitForIdentify(shardId: number, signal?: AbortSignal): Promise<void> {
    if (this.#identifyConcurrency === "auto" && this.#gateway) {
      const info = await this.fetchGatewayInformation();
      this.#identify.concurrency = info.session_start_limit.max_concurrency;
    }

    await this.#identify.wait(shardId, signal);
    this.#gateway?.consume();
  }

  /**
   * Closes every shard for good, and releases the strategy.
   */
  public async destroy(): Promise<void> {
    await Promise.all(this.channels.map((channel) => channel.close()));
    if (this.#initialized) await this.strategy.destroy?.();
    this.#initialized = false;
  }

  /**
   * Carries a message a shard sends to another shard, or to every shard.
   *
   * @internal
   */
  public async route(body: unknown, to: ShardTarget, from: number): Promise<void> {
    if (to === "all")
      await Promise.all(this.channels.map((channel) => channel.send(body, {}, from)));
    else await this.#channel(to).send(body, {}, from);
  }

  /**
   * Carries a request a shard sends to another shard, or to every shard.
   *
   * @internal
   */
  public async forward(
    body: unknown,
    to: ShardTarget,
    from: number,
    options: BroadcastRequestOptions,
  ): Promise<unknown> {
    // Answer a little before the sender gives up, so partial results still reach it.
    const timeout =
      options.timeout === undefined ? undefined : Math.max(Math.floor(options.timeout * 0.95), 1);
    const forwarded = { timeout, signal: options.signal };
    if (to !== "all") return this.#channel(to).request(body, forwarded, from);

    const requests = this.channels.map((channel) => channel.request(body, forwarded, from));
    return options.partial
      ? serializeSettled(await Promise.allSettled(requests))
      : Promise.all(requests);
  }

  /**
   * Answers the requests the sharder itself sends.
   *
   * @internal
   */
  public async handleSystem(
    call: SystemCall,
    body: unknown,
    channel: ShardChannel,
    signal: AbortSignal,
  ): Promise<unknown> {
    switch (call) {
      case "identify":
        await this.waitForIdentify(body as number, signal);
        return null;
      case "gatewayInformation":
        return this.fetchGatewayInformation();
      case "control":
        return this.#control(body as ControlRequest, channel);
      default:
        throw new Error(`Shards cannot send the ${call} system request`);
    }
  }

  /**
   * Decides what happens to a shard that stopped on its own.
   *
   * @internal
   */
  public supervise(channel: ShardChannel, previous: ShardStatus): void {
    if (previous === "Exiting") {
      channel.markStopped("it exited");
      return;
    }

    if (previous !== "Restarting") {
      const { crashes, restart } = this.supervisor.crash(channel.id);
      if (!restart) {
        channel.markStopped("it crashed too often");
        if (this.listenerCount("shardGiveUp") > 0) this.emit("shardGiveUp", channel, crashes);
        else this.reportError(new ShardUnavailableError(channel.id, `it crashed ${crashes} times`));
        return;
      }

      const others =
        this.supervisor.strategy === "one-for-all"
          ? this.channels.filter((other) => other !== channel)
          : this.supervisor.strategy === "rest-for-one"
            ? this.channels.filter((other) => other.id > channel.id)
            : [];
      for (const other of others) {
        if (!other.stopped)
          void this.restart(other.id).catch((error: unknown) => this.reportError(error));
      }
    }

    this.emit("shardRestart", channel);
    void this.#startWithRetries(channel).catch((error: unknown) => this.reportError(error));
  }

  /**
   * @internal
   */
  public recordReadyTime(time: number): void {
    this.#readyTimes.push(time);
    if (this.#readyTimes.length > 20) this.#readyTimes.shift();
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
  public reportShardError(channel: ShardChannel, error: unknown): void {
    if (channel.listenerCount("error") > 0) channel.emit("error", error);
    if (this.listenerCount("shardError") > 0) this.emit("shardError", channel, error);
    else if (channel.listenerCount("error") === 0) this.reportError(error);
  }

  /**
   * @internal
   */
  public reportInvalidMessage(channel: ShardChannel, error: unknown): void {
    if (this.listenerCount("shardInvalidMessage") > 0)
      this.emit("shardInvalidMessage", channel, error);
    else console.error(`Shard ${channel.id} sent an invalid message:`, error);
  }

  async #control(request: ControlRequest, from: ShardChannel): Promise<null> {
    const { action, target } = request;
    if ("shard" in target) {
      if (action === "start") await this.startShard(target.shard);
      else if (action === "close") await this.closeShard(target.shard);
      else await this.restartShard(target.shard);
      return null;
    }

    const channels = target.channel === "all" ? this.channels : [this.#channel(target.channel)];
    const run = async () => {
      for (const channel of channels) {
        if (action === "restart") await this.restart(channel.id);
        else if (action === "close") await channel.close();
        else if (!channel.running) await this.#startWithRetries(channel, true);
      }
    };

    // A shard closing or restarting itself would never get the reply: answer first.
    if (action !== "start" && channels.includes(from)) {
      setImmediate(() => void run().catch((error: unknown) => this.reportError(error)));
    } else {
      await run();
    }

    return null;
  }

  async #init(): Promise<void> {
    if (this.#initialized) return;
    await this.strategy.init?.();
    this.#initialized = true;
  }

  // `force` starts a shard closed for a restart; otherwise, a shard closed meanwhile is left alone.
  async #startWithRetries(channel: ShardChannel, force = false): Promise<void> {
    await this.#init();
    for (;;) {
      try {
        await this.#enqueue(async () => {
          if ((!force && channel.stopped) || channel.running) return;
          await channel.start();
        });
        return;
      } catch (error) {
        if (channel.stopped) throw error;
        const { restart } = this.supervisor.crash(channel.id);
        if (!restart) {
          channel.markStopped("it failed to start too often");
          throw error;
        }
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

  #apply(layout: ResolvedLayout): void {
    this.shardCount = layout.shardCount;
    this.channels = layout.channels.map(
      (shards, id) => new ShardChannel(this, id, shards, layout.shardCount),
    );
  }

  #channel(channelId: number): ShardChannel {
    const channel = this.channels[channelId];
    if (!channel) throw new ShardUnavailableError(channelId, "there is no such shard");
    return channel;
  }

  #channelForShard(shardId: number): ShardChannel {
    const channel = this.channelFor(shardId);
    if (!channel) throw new RangeError(`No shard connects the gateway shard ${shardId}`);
    return channel;
  }
}

interface ResolvedLayout {
  shardCount: number;
  channels: number[][];
}

function needsGateway(layout: ShardLayoutOptions): boolean {
  return (
    layout.totalShards === "auto" ||
    (layout.totalShards === undefined && (layout.shards ?? "auto") === "auto" && !layout.shardList)
  );
}

function resolveLayout(
  layout: ShardLayoutOptions,
  info: GatewayInformation | null,
): ResolvedLayout {
  const { shards = "auto", shardList, clusters = availableParallelism() } = layout;
  const recommended = info ? resolveRecommendedShardCount(info.shards, layout.recommended) : null;
  const sizes = Array.isArray(shards) ? (shards as readonly number[]) : null;
  if (sizes?.some((size) => !Number.isSafeInteger(size) || size < 1) || sizes?.length === 0) {
    throw new RangeError("shards must list positive integers");
  }

  const declared =
    typeof shards === "number" ? shards : sizes ? sizes.reduce((sum, size) => sum + size, 0) : null;
  const totalShards =
    layout.totalShards === "auto"
      ? recommended!
      : (layout.totalShards ?? declared ?? shardList?.length ?? recommended!);
  if (!Number.isSafeInteger(totalShards) || totalShards < 1) {
    throw new RangeError("The total number of gateway shards must be a positive integer");
  }

  const ids = shardList ? [...shardList] : range(declared ?? totalShards);
  if (new Set(ids).size !== ids.length || ids.some((id) => id < 0 || id >= totalShards)) {
    throw new RangeError(`shardList must list distinct gateway shards below ${totalShards}`);
  }

  let channels: number[][];
  if (sizes) {
    if (ids.length !== declared)
      throw new RangeError("shards must add up to the shardList's length");
    let offset = 0;
    channels = sizes.map((size) => ids.slice(offset, (offset += size)));
  } else if (typeof shards === "number") {
    if (ids.length !== shards) throw new RangeError("shards must be the shardList's length");
    channels = ids.map((id) => [id]);
  } else {
    if (!Number.isSafeInteger(clusters) || clusters < 1) {
      throw new RangeError("clusters must be a positive integer");
    }

    const size = Math.ceil(ids.length / clusters);
    channels = [];
    for (let index = 0; index < ids.length; index += size)
      channels.push(ids.slice(index, index + size));
  }

  return { shardCount: totalShards, channels };
}

function range(length: number): number[] {
  return Array.from({ length }, (_, index) => index);
}
