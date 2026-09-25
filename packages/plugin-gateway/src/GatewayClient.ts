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
  type GatewayDispatchPayload,
  type GatewayIntentBits,
} from "discord-api-types/v10";
import { ChannelManager } from "./managers/ChannelManager.js";
import { GuildManager } from "./managers/GuildManager.js";
import { GuildMemberManager } from "./managers/GuildMemberManager.js";
import { MessageManager } from "./managers/MessageManager.js";
import { RoleManager } from "./managers/RoleManager.js";
import { ThreadManager } from "./managers/ThreadManager.js";
import { UserManager } from "./managers/UserManager.js";
import type { User } from "./structures/User.js";
import { DispatchHandlers, type DispatchHandler } from "./util/dispatch.js";
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
  public user: User | null = null;

  public readonly users: UserManager;
  public readonly guilds: GuildManager;
  public readonly channels: ChannelManager;
  public readonly threads: ThreadManager;
  public readonly messages: MessageManager;
  public readonly members: GuildMemberManager;
  public readonly roles: RoleManager;

  // Dispatches are processed sequentially per shard, so an asynchronous cache never reorders them.
  readonly #queues = new Map<number, Promise<void>>();

  public constructor(options: GatewayClientOptions) {
    super(options);

    this.cache = options.cache;
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
      const previous = this.#queues.get(shardId) ?? Promise.resolve();
      const next = previous.then(() =>
        this.handleDispatch(payload, shardId).catch((error: unknown) => {
          // Emitting "error" without listeners throws, which would reject the queue and stall the shard.
          if (this.listenerCount("error") > 0) this.emit("error", error);
          else
            this.logger.error(
              `[Gateway] [Shard ${shardId}] Failed to process ${payload.t}:`,
              error,
            );
        }),
      );
      this.#queues.set(shardId, next);
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
    await Promise.all(this.#queues.values());
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
    const state = await handler?.before?.(this, payload.d as never);

    if (this.cache) await applyGatewayDispatch(this.cache, payload);
    if (!handler) return;

    const args = await handler.build(this, payload.d as never, state, shardId);
    this.emit(handler.event, ...(args as GatewayEventMap[GatewayEventName]));
  }
}
