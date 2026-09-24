import {
  WebSocketManager,
  WebSocketShardEvents,
  type OptionalWebSocketManagerOptions,
  type ShardRange,
} from "@discordjs/ws";
import { Client, container, type ClientOptions } from "@wolfstar/http-framework";
import { applyGatewayDispatch, type Cache } from "@wolfstar/plugin-cache";
import {
  GatewayDispatchEvents,
  GatewayOpcodes,
  type GatewayDispatchPayload,
  type GatewayReadyDispatchData,
  type GatewayIntentBits,
} from "discord-api-types/v10";
import { ChannelManager } from "./managers/ChannelManager.js";
import { GuildManager } from "./managers/GuildManager.js";
import { GuildMemberManager } from "./managers/GuildMemberManager.js";
import { MessageManager } from "./managers/MessageManager.js";
import { RoleManager } from "./managers/RoleManager.js";
import { ThreadManager } from "./managers/ThreadManager.js";
import { UserManager } from "./managers/UserManager.js";
import type { ClientUser } from "./structures/ClientUser.js";
import { DispatchHandlers, type DispatchHandler } from "./util/dispatch.js";
import { dispatchPartition, DispatchQueue, type DispatchQueueStats } from "./util/DispatchQueue.js";
import { DispatchTimeoutError } from "./util/errors.js";
import type { GatewayEventMap, GatewayEventName } from "./util/events.js";

export interface GatewayClientOptions extends ClientOptions {
  /**
   * The gateway intents to identify with, e.g. `GatewayIntentBits.Guilds | GatewayIntentBits.GuildMessages`.
   */
  intents: GatewayIntentBits | number;
  /**
   * The total number of shards across every process, `null` to use the amount recommended by Discord.
   *
   * @default null
   */
  shardCount?: number | null;
  /**
   * The IDs of the shards this client manages, `null` to manage all of them.
   *
   * @default null
   */
  shardIds?: number[] | ShardRange | null;
  /**
   * The cache to write every dispatch into, see `@wolfstar/plugin-cache`. Without one, the managers' `get` always
   * resolve to `undefined`, update events receive `null` as their previous state, and `fetch` always hits the API.
   *
   * @default undefined
   */
  cache?: Cache;
  /**
   * Additional options for the underlying `@discordjs/ws` `WebSocketManager`, e.g. `compression` or
   * `initialPresence`.
   */
  gateway?: Partial<Omit<OptionalWebSocketManagerOptions, "token" | "shardCount" | "shardIds">>;
  /**
   * What to do with a dispatch whose cache read or write fails, e.g. while Redis is unreachable. The error is always
   * reported through the `error` event (or the logger when nobody listens to it).
   *
   * - `"skip"`: drop the dispatch's event, so listeners never see state the cache does not hold.
   * - `"emitUncached"`: still emit the event, built from the payload alone, with `null` as the previous state.
   *
   * @default "skip"
   */
  cacheFailure?: "skip" | "emitUncached";
  /**
   * The time, in milliseconds, after which a dispatch still being processed is reported as a `DispatchTimeoutError`
   * through the `error` event. The dispatch is not cancelled. `null` disables the check.
   *
   * @default 30_000
   */
  dispatchTimeout?: number | null;
}

/**
 * A {@link Client} that, on top of serving HTTP interactions, connects to the Discord gateway, writes every dispatch
 * into an optional {@link Cache}, and emits {@link GatewayEventMap} events carrying structures.
 *
 * @example
 * ```typescript
 * import { GatewayClient } from '@wolfstar/plugin-gateway';
 * import { createInMemoryCache } from '@wolfstar/plugin-cache';
 * import { GatewayIntentBits } from 'discord-api-types/v10';
 *
 * const client = new GatewayClient({
 *   intents: GatewayIntentBits.Guilds | GatewayIntentBits.GuildMessages,
 *   cache: createInMemoryCache(),
 * });
 *
 * client.on('messageCreate', (message) => console.log(`${message.author.username}: ${message.content}`));
 *
 * await client.load();
 * await client.connect();
 * await client.listen({ port: 8080 });
 * ```
 */
export class GatewayClient extends Client {
  /**
   * The cache every dispatch is written into, if any.
   */
  public readonly cache: Cache | undefined;

  /**
   * The underlying `@discordjs/ws` manager, handling the shards' connections, resumes, and identify rate limits.
   */
  public readonly gateway: WebSocketManager;

  /**
   * The bot user, set once the first shard receives `READY`.
   */
  public user: ClientUser | null = null;

  public readonly users: UserManager;
  public readonly guilds: GuildManager;
  public readonly channels: ChannelManager;
  public readonly threads: ThreadManager;
  public readonly messages: MessageManager;
  public readonly members: GuildMemberManager;
  public readonly roles: RoleManager;

  /**
   * What happens to a dispatch whose cache read or write fails, see {@link GatewayClientOptions.cacheFailure}.
   */
  public readonly cacheFailure: "skip" | "emitUncached";

  /**
   * See {@link GatewayClientOptions.dispatchTimeout}.
   */
  public readonly dispatchTimeout: number | null;

  // Dispatches of a guild are processed in order, so an asynchronous cache never reorders them, while different
  // guilds proceed concurrently.
  readonly #queue = new DispatchQueue();

  readonly #shardCount: number | null;

  public constructor(options: GatewayClientOptions) {
    super(options);

    this.cache = options.cache;
    this.cacheFailure = options.cacheFailure ?? "skip";
    this.dispatchTimeout = options.dispatchTimeout === undefined ? 30_000 : options.dispatchTimeout;
    this.#shardCount = options.shardCount ?? null;
    this.users = new UserManager(this);
    this.guilds = new GuildManager(this);
    this.channels = new ChannelManager(this);
    this.threads = new ThreadManager(this);
    this.messages = new MessageManager(this);
    this.members = new GuildMemberManager(this);
    this.roles = new RoleManager(this);

    this.gateway = new WebSocketManager({
      ...options.gateway,
      // The base client validated the token already, and scrubs it from `this.options`.
      token: (options.discordToken ?? process.env.DISCORD_TOKEN)!,
      intents: options.intents as GatewayIntentBits,
      rest: container.rest,
      shardCount: options.shardCount ?? null,
      shardIds: options.shardIds ?? null,
    });

    this.gateway.on(WebSocketShardEvents.Dispatch, (payload, shardId) => {
      const partition = dispatchPartition(payload);
      void this.#queue.enqueue(shardId, partition, () =>
        this.runDispatch(payload, shardId, partition),
      );
    });
    this.gateway.on(WebSocketShardEvents.Resumed, (shardId) => this.emit("shardResume", shardId));
    this.gateway.on(WebSocketShardEvents.Closed, (code, shardId) =>
      this.emit("shardClose", shardId, code),
    );
    this.gateway.on(WebSocketShardEvents.Error, (error, shardId) =>
      this.emit("shardError", error, shardId),
    );
    this.gateway.on(WebSocketShardEvents.Debug, (message, shardId) =>
      this.logger.debug(`[Gateway] [Shard ${shardId}] ${message}`),
    );
  }

  /**
   * Connects every configured shard to the gateway.
   */
  public async connect(): Promise<void> {
    await this.gateway.connect();
  }

  /**
   * Disconnects every shard from the gateway. The HTTP server, if listening, is left untouched.
   */
  public async destroy(): Promise<void> {
    await this.gateway.destroy();
    await this.idle();
  }

  /**
   * Resolves once every dispatch received so far has been processed.
   */
  public async idle(): Promise<void> {
    await this.#queue.idle();
  }

  /**
   * The dispatches received but not processed yet, and the partitions (guilds, direct message channels) they are
   * queued in. A growing `pending` count usually means a slow or unreachable cache.
   */
  public get queueStats(): DispatchQueueStats {
    return this.#queue.stats;
  }

  /**
   * Processes a gateway dispatch: emits it as `raw`, writes it into the cache, and emits the matching
   * {@link GatewayEventMap} event, if any.
   *
   * @param payload The dispatch payload.
   * @param shardId The ID of the shard that received it.
   */
  protected async handleDispatch(payload: GatewayDispatchPayload, shardId: number): Promise<void> {
    this.emit("raw", payload, shardId);

    // Interactions are served by the HTTP endpoint, see the `DispatchHandlers` remarks.
    if (payload.t === GatewayDispatchEvents.InteractionCreate) return;

    const handler = DispatchHandlers[payload.t] as
      | DispatchHandler<typeof payload.t, GatewayEventName>
      | undefined;
    // `READY` is never dropped: it sets `client.user` and `shardReady` from the payload alone, and a shard without it
    // looks dead to the bot. Reconciling the cache with it is best effort, see `reconcileGuilds`.
    const isReady = payload.t === GatewayDispatchEvents.Ready;
    if (isReady) await this.reconcileGuilds(payload.d, shardId);

    let state: unknown;
    try {
      state = await handler?.before?.(this, payload.d as never);
      if (this.cache) await applyGatewayDispatch(this.cache, payload);
    } catch (error) {
      if (this.cacheFailure === "skip" && !isReady) throw error;
      this.reportError(error, payload.t, shardId);
      state = undefined;
    }

    if (!handler) return;

    const args = await handler.build(this, payload.d as never, state, shardId);
    this.emit(handler.event, ...(args as GatewayEventMap[GatewayEventName]));
  }

  /**
   * Drops the cached guilds of a shard its `READY` no longer lists, and emits `guildDelete` for each of them.
   *
   * @remarks
   * They are the guilds the bot left while it was disconnected, or while the process was down with a persistent
   * cache. Discord does not replay those removals on a new session, so the cache would otherwise keep them forever.
   *
   * It is best effort: any failure (cache unreachable, unknown shard count) is reported through `error` and stops the
   * reconciliation, keeping the remaining guilds, but never fails `READY` itself.
   *
   * @param data The `READY` data.
   * @param shardId The shard that received it.
   */
  protected async reconcileGuilds(data: GatewayReadyDispatchData, shardId: number): Promise<void> {
    try {
      await this.dropUnlistedGuilds(data, shardId);
    } catch (error) {
      this.reportError(error, GatewayDispatchEvents.Ready, shardId);
    }
  }

  private async dropUnlistedGuilds(data: GatewayReadyDispatchData, shardId: number): Promise<void> {
    if (!this.cache) return;

    const cached = await this.cache.guilds.keys();
    if (cached.length === 0) return;

    // Without the shard count, the guilds of this shard cannot be told apart from the others'.
    const count = data.shard?.[1] ?? this.#shardCount ?? (await this.gateway.getShardCount());
    const listed = new Set(data.guilds.map((guild) => guild.id));
    const shardCount = BigInt(count);
    for (const id of cached) {
      if (listed.has(id) || Number((BigInt(id) >> 22n) % shardCount) !== shardId) continue;

      const guild = (await this.guilds.get(id)) ?? null;
      await applyGatewayDispatch(this.cache, {
        op: GatewayOpcodes.Dispatch,
        s: 0,
        t: GatewayDispatchEvents.GuildDelete,
        d: { id },
      });
      this.emit("guildDelete", guild, { id });
    }
  }

  private async runDispatch(
    payload: GatewayDispatchPayload,
    shardId: number,
    partition: string | null,
  ): Promise<void> {
    const timeout = this.dispatchTimeout;
    const timer =
      timeout === null
        ? null
        : setTimeout(() => {
            this.reportError(
              new DispatchTimeoutError(payload.t, shardId, partition, timeout),
              payload.t,
              shardId,
            );
          }, timeout);
    timer?.unref?.();

    try {
      await this.handleDispatch(payload, shardId);
    } catch (error) {
      this.reportError(error, payload.t, shardId);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // Emitting "error" without listeners throws, which would reject the queue and stall the partition.
  private reportError(error: unknown, type: string, shardId: number): void {
    if (this.listenerCount("error") > 0) this.emit("error", error);
    else this.logger.error(`[Gateway] [Shard ${shardId}] Failed to process ${type}:`, error);
  }
}
