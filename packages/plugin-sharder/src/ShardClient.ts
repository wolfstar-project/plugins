import { EventEmitter } from "node:events";
import { isMainThread, parentPort, threadId, workerData } from "node:worker_threads";
import {
  registerMessageHandler,
  resolveMessageHandler,
  type MessageHandler,
} from "./messages/MessageHandler.js";
import {
  registerMessageTransformer,
  resolveMessageTransformer,
  type MessageTransformer,
} from "./messages/MessageTransformer.js";
import {
  Op,
  PacketCodec,
  ShardStatus,
  type ControlRequest,
  type Packet,
  type SerializedSettledResult,
  type ShardTarget,
  type SystemCall,
} from "./messages/protocol.js";
import { ShardContextVariable, type ShardContext } from "./strategies/ChannelStrategy.js";
import type { GatewayInformation } from "./util/gateway.js";
import {
  IncomingRequests,
  OutgoingRequests,
  deserializeSettled,
  type BroadcastRequestOptions,
  type RequestHandler,
  type RequestOptions,
} from "./util/requests.js";

// The longest delay `setTimeout` takes: identifies may wait behind every other gateway shard.
const MaxTimeout = 2_147_483_647;

/**
 * The shard's end of the channel to its manager (or proxy).
 */
export interface ClientTransport {
  send(data: unknown): Promise<void>;
  onMessage(listener: (data: unknown) => void): void;
  /**
   * Registers what to do when the channel to the manager closes, i.e. when the manager died.
   */
  onDisconnect(listener: () => void): void;
  /**
   * Stops the shard.
   */
  exit(code: number): void;
}

/**
 * The options of a {@link ShardClient}.
 */
export interface ShardClientOptions {
  /**
   * How messages are serialized. Defaults to the manager's, built from the registry.
   */
  messageHandler?: MessageHandler | string;
  /**
   * How serialized messages are transformed. Defaults to the manager's, built from the registry.
   */
  transformers?: readonly (MessageTransformer | string)[];
  /**
   * The shard's context. Defaults to the one its manager passed when spawning it.
   */
  context?: ShardContext;
  /**
   * The channel to the manager. Defaults to the one of {@link ShardContext.transport}.
   */
  transport?: ClientTransport;
}

/**
 * Starts and closes the gateway shards of this shard, when the manager asks.
 */
export interface ShardHandler {
  start?(shardId: number, context: { signal: AbortSignal }): unknown;
  close?(shardId: number, context: { signal: AbortSignal }): unknown;
}

/**
 * Paces identifies across every shard, the shape of `@discordjs/ws`'s `IIdentifyThrottler`.
 */
export interface IdentifyThrottler {
  waitForIdentify(shardId: number, signal: AbortSignal): Promise<void>;
}

/**
 * The events of a {@link ShardClient}.
 */
export interface ShardClientEvents {
  /**
   * A message from the manager (`from` is `null`) or from another shard.
   */
  message: [body: any, from: number | null];
  /**
   * The channel to the manager closed. Without listeners, the shard exits.
   */
  disconnect: [];
  /**
   * The manager stopped pinging, e.g. a proxy lost it. The shard keeps running.
   */
  managerUnresponsive: [];
  /**
   * The manager sent data that could not be read. Without listeners, it is logged with `console.error`.
   */
  invalidMessage: [error: unknown];
  /**
   * Without listeners, errors are logged with `console.error`.
   */
  error: [error: unknown];
}

/**
 * The shard's side of the sharder: it tells the manager its status, and messages the manager and the other shards.
 *
 * @example
 * ```ts
 * const shard = new ShardClient();
 * const client = new GatewayClient({
 *   ...options,
 *   ...shard.gatewayOptions,
 *   gateway: { buildIdentifyThrottler: () => shard.identifyThrottler },
 * });
 * // Reuse the manager's `GET /gateway/bot` rather than requesting it again.
 * client.gateway.fetchGatewayInformation = () => shard.fetchGatewayInformation();
 * shard.setRequestHandler((body) => ...);
 * ```
 */
export class ShardClient extends EventEmitter<ShardClientEvents> {
  /**
   * The context of this process or thread, when a {@link ShardManager} spawned it; `null` otherwise.
   */
  public static get context(): ShardContext | null {
    const raw: unknown = isMainThread
      ? process.env[ShardContextVariable]
      : (workerData as Record<string, unknown> | null)?.[ShardContextVariable];
    return typeof raw === "string" ? (JSON.parse(raw) as ShardContext) : null;
  }

  /**
   * Registers a message handler the manager can refer to by name. The sharder RFC's API.
   *
   * @param name The name of the handler.
   * @param factory Builds the handler.
   */
  public static registerMessageHandler(
    name: string,
    factory: () => MessageHandler,
  ): typeof ShardClient {
    registerMessageHandler(name, factory);
    return ShardClient;
  }

  /**
   * Registers a message transformer the manager can refer to by name. The sharder RFC's API.
   *
   * @param name The name of the transformer.
   * @param factory Builds the transformer.
   */
  public static registerMessageTransformer(
    name: string,
    factory: () => MessageTransformer,
  ): typeof ShardClient {
    registerMessageTransformer(name, factory);
    return ShardClient;
  }

  /**
   * The ID of the shard, its channel's in the manager.
   */
  public readonly id: number;

  /**
   * The IDs of the gateway shards the shard connects.
   */
  public readonly shards: readonly number[];

  /**
   * The total number of gateway shards, across every shard.
   */
  public readonly shardCount: number;

  public readonly requestTimeout: number;

  /**
   * The last status signalled to the manager.
   */
  public status: ShardStatus = ShardStatus.Starting;

  /**
   * When the manager last pinged the shard, `null` before its first ping.
   */
  public lastPingTimestamp: number | null = null;

  readonly #transport: ClientTransport;
  readonly #codec: PacketCodec;
  readonly #outgoing = new OutgoingRequests();
  readonly #incoming = new IncomingRequests();
  readonly #pingTimeout: number | null;
  #watchdog: NodeJS.Timeout | null = null;
  #requestHandler: RequestHandler<{ from: number | null }> | null = null;
  #closeHandler: (() => unknown) | null = null;
  #shardHandler: ShardHandler | null = null;

  public constructor(options: ShardClientOptions = {}) {
    super();
    const context = options.context ?? ShardClient.context;
    if (!context) throw new Error("This process or thread was not spawned by a ShardManager");

    this.id = context.id;
    this.shards = context.shards;
    this.shardCount = context.shardCount;
    this.requestTimeout = context.requestTimeout;
    this.#codec = new PacketCodec(
      resolveMessageHandler(options.messageHandler ?? context.messageHandler),
      (options.transformers ?? context.transformers).map(resolveMessageTransformer),
    );
    this.#transport = options.transport ?? defaultTransport(context);
    this.#transport.onMessage((data) => void this.#receive(data));
    this.#transport.onDisconnect(() => {
      this.#stopWatchdog();
      if (this.listenerCount("disconnect") > 0) this.emit("disconnect");
      else this.#transport.exit(0);
    });

    this.#pingTimeout = context.pingTimeout;
    void this.#signal(ShardStatus.Starting).catch((error: unknown) => this.#report(error));
  }

  /**
   * The ID of the shard's process.
   */
  public get pid(): number {
    return process.pid;
  }

  /**
   * The ID of the shard's thread, `0` for a process's main thread.
   */
  public get threadId(): number {
    return threadId;
  }

  /**
   * The gateway shards to connect, to spread into `GatewayClient`'s (or `@discordjs/ws`'s) options.
   */
  public get gatewayOptions(): { shardIds: number[]; shardCount: number } {
    return { shardIds: [...this.shards], shardCount: this.shardCount };
  }

  /**
   * Paces the identifies of the gateway shards across every shard, through the manager: pass it as `@discordjs/ws`'s
   * `buildIdentifyThrottler`. The manager then needs no spawn delay.
   */
  public get identifyThrottler(): IdentifyThrottler {
    return {
      waitForIdentify: async (shardId, signal) => {
        await this.#system("identify", shardId, { timeout: MaxTimeout, signal });
      },
    };
  }

  /**
   * Gets `GET /gateway/bot` from the manager, fetched once for every shard, e.g. to replace `@discordjs/ws`'s
   * `WebSocketManager#fetchGatewayInformation`.
   */
  public fetchGatewayInformation(): Promise<GatewayInformation> {
    return this.#system("gatewayInformation", null) as Promise<GatewayInformation>;
  }

  /**
   * Tells the manager that the shard is ready, e.g. once its gateway shards are. The manager spawns the next shard
   * only then.
   */
  public ready(): Promise<void> {
    // The manager pings ready shards only.
    if (!this.#watchdog && this.#pingTimeout !== null) {
      this.#watchdog = setTimeout(() => {
        this.#watchdog = null;
        this.emit("managerUnresponsive");
      }, this.#pingTimeout);
      this.#watchdog.unref();
    }

    return this.#signal(ShardStatus.Ready);
  }

  /**
   * Tells the manager that the shard lost what it serves, e.g. the gateway. Messages for it wait until it is ready
   * again.
   */
  public disconnected(): Promise<void> {
    return this.#signal(ShardStatus.Disconnected);
  }

  /**
   * Tells the manager that the shard is reconnecting to what it serves.
   */
  public reconnecting(): Promise<void> {
    return this.#signal(ShardStatus.Reconnecting);
  }

  /**
   * Stops the shard for good: the manager does not respawn it.
   *
   * @param code The exit code.
   */
  public async exit(code = 0): Promise<void> {
    await this.#stop(ShardStatus.Exiting, code);
  }

  /**
   * Stops the shard, for the manager to spawn it again.
   */
  public async restart(): Promise<void> {
    await this.#stop(ShardStatus.Restarting, 0);
  }

  /**
   * Sends a message to the manager, emitted as its `message` event, or to other shards.
   *
   * @param body The message.
   * @param to The ID of the shard to send it to, or `"all"`. Left out, it goes to the manager.
   */
  public send(body: unknown, to?: ShardTarget): Promise<void> {
    return this.#write({ op: Op.Message, body, to });
  }

  /**
   * Sends a request to the manager or to another shard.
   *
   * @param body The request.
   * @param options Where it goes (the manager by default), its timeout, and its abort signal.
   */
  public request<Reply = unknown>(
    body: unknown,
    options: RequestOptions & { to?: number } = {},
  ): Promise<Reply> {
    return this.#outgoing.request(
      (packet) => this.#write(packet),
      { body, to: options.to },
      options.timeout ?? this.requestTimeout,
      options.signal,
    ) as Promise<Reply>;
  }

  /**
   * Sends a request to every shard, this one included, like discord.js's `broadcastEval` without the `eval`.
   *
   * @param body The request.
   * @param options The timeout and abort signal of the request, and whether to keep partial results.
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
  public async broadcastRequest(
    body: unknown,
    options: BroadcastRequestOptions = {},
  ): Promise<unknown> {
    const reply = await this.#outgoing.request(
      (packet) => this.#write(packet),
      { body, to: "all", partial: options.partial },
      options.timeout ?? this.requestTimeout,
      options.signal,
    );
    return options.partial ? deserializeSettled(reply as SerializedSettledResult[]) : reply;
  }

  /**
   * Asks the manager to start, close, or restart shards or gateway shards.
   *
   * @param request What to do, and to what.
   * @param options The timeout and abort signal of the request.
   * @example
   * ```ts
   * await shard.control({ action: "restart", target: { channel: "all" } });
   * await shard.control({ action: "restart", target: { shard: 12 } });
   * ```
   */
  public async control(request: ControlRequest, options?: RequestOptions): Promise<void> {
    await this.#system("control", request, options);
  }

  /**
   * Sets the handler answering the requests of the manager and of the other shards.
   *
   * @param handler The handler; its return value is the reply. `from` is the shard asking, `null` for the manager.
   */
  public setRequestHandler(handler: RequestHandler<{ from: number | null }> | null): this {
    this.#requestHandler = handler;
    return this;
  }

  /**
   * Sets what to do when the manager closes the shard, e.g. disconnect from the gateway. The shard exits once it
   * resolves; without a handler, it exits right away.
   *
   * @param handler The handler.
   */
  public setCloseHandler(handler: (() => unknown) | null): this {
    this.#closeHandler = handler;
    return this;
  }

  /**
   * Sets how the manager starts and closes the gateway shards of this shard, for `manager.startShard` & co.
   *
   * @param handler Starts or closes a gateway shard, resolving once done.
   */
  public setShardHandler(handler: ShardHandler | null): this {
    this.#shardHandler = handler;
    return this;
  }

  #system(call: SystemCall, body: unknown, options: RequestOptions = {}): Promise<unknown> {
    return this.#outgoing.request(
      (packet) => this.#write(packet),
      { body, system: call },
      options.timeout ?? this.requestTimeout,
      options.signal,
    );
  }

  async #signal(status: ShardStatus): Promise<void> {
    this.status = status;
    await this.#write({ op: Op.Signal, status });
  }

  #stopWatchdog(): void {
    if (this.#watchdog) clearTimeout(this.#watchdog);
    this.#watchdog = null;
  }

  async #stop(status: ShardStatus, code: number): Promise<void> {
    this.#stopWatchdog();
    await this.#signal(status).catch(() => undefined);
    this.#transport.exit(code);
  }

  async #write(packet: Packet): Promise<void> {
    await this.#transport.send(await this.#codec.encode(packet, { channelId: this.id }));
  }

  async #receive(data: unknown): Promise<void> {
    let packet: Packet;
    try {
      packet = await this.#codec.decode(data, { channelId: this.id });
    } catch (error) {
      if (this.listenerCount("invalidMessage") > 0) this.emit("invalidMessage", error);
      else console.error("The shard manager sent an invalid message:", error);
      return;
    }

    switch (packet.op) {
      case Op.Ping:
        this.lastPingTimestamp = Date.now();
        this.#watchdog?.refresh();
        await this.#write({ op: Op.Pong, sentAt: packet.sentAt }).catch(() => undefined);
        break;
      case Op.Message:
        this.emit("message", packet.body, packet.from ?? null);
        break;
      case Op.Request: {
        const { system } = packet;
        const handler = system
          ? (body: number, { signal }: { signal: AbortSignal }) =>
              this.#handleSystem(system, body, signal)
          : this.#requestHandler;
        await this.#incoming.handle((reply) => this.#write(reply), packet, handler, {
          from: packet.from ?? null,
        });
        break;
      }
      case Op.Reply:
        this.#outgoing.settle(packet);
        break;
      case Op.Abort:
        this.#incoming.abort(packet.nonce);
        break;
      case Op.Close:
        try {
          await this.#closeHandler?.();
        } catch (error) {
          this.#report(error);
        }

        await this.exit(0);
        break;
      default:
        break;
    }
  }

  async #handleSystem(call: SystemCall, shardId: number, signal: AbortSignal): Promise<null> {
    const action =
      call === "startShard"
        ? this.#shardHandler?.start
        : call === "closeShard"
          ? this.#shardHandler?.close
          : null;
    if (call !== "startShard" && call !== "closeShard") {
      throw new Error(`The manager cannot send the ${call} system request`);
    }

    if (!this.shards.includes(shardId))
      throw new RangeError(`This shard does not connect the gateway shard ${shardId}`);
    if (!action)
      throw new Error(
        `There is no shard handler to ${call === "startShard" ? "start" : "close"} gateway shards`,
      );
    await action.call(this.#shardHandler, shardId, { signal });
    return null;
  }

  #report(error: unknown): void {
    if (this.listenerCount("error") > 0) this.emit("error", error);
    else console.error(error);
  }
}

function defaultTransport(context: ShardContext): ClientTransport {
  if (context.transport === "worker") {
    if (!parentPort) throw new Error("The shard is not running in a worker thread");
    const port = parentPort;
    return {
      send: async (data) => port.postMessage(data),
      onMessage: (listener) => port.on("message", listener),
      // A worker thread stops with its manager's process.
      onDisconnect: () => undefined,
      exit: (code) => process.exit(code),
    };
  }

  if (!process.send) throw new Error("The shard has no IPC channel to its manager");
  return {
    send: (data) =>
      new Promise((resolve, reject) => {
        if (!process.connected) {
          reject(new Error("The IPC channel to the manager is closed"));
          return;
        }

        process.send!(data, undefined, undefined, (error: Error | null) =>
          error ? reject(error) : resolve(),
        );
      }),
    onMessage: (listener) => process.on("message", listener),
    onDisconnect: (listener) => process.once("disconnect", listener),
    exit: (code) => process.exit(code),
  };
}
