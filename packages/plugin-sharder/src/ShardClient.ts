import { EventEmitter } from "node:events";
import { isMainThread, parentPort, workerData } from "node:worker_threads";
import {
  JsonMessageHandler,
  type ChannelData,
  type MessageHandler,
} from "./messages/MessageHandler.js";
import type { MessageTransformer } from "./messages/MessageTransformer.js";
import {
  Op,
  PacketCodec,
  ShardStatus,
  type Packet,
  type ShardTarget,
} from "./messages/protocol.js";
import { ShardContextVariable, type ShardContext } from "./strategies/ChannelStrategy.js";
import {
  IncomingRequests,
  OutgoingRequests,
  type RequestHandler,
  type RequestOptions,
} from "./util/requests.js";

/**
 * The shard's end of the channel to its manager.
 */
export interface ClientTransport {
  send(data: ChannelData): Promise<void>;
  onMessage(listener: (data: ChannelData) => void): void;
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
   * How messages are serialized: the manager's.
   *
   * @default new JsonMessageHandler()
   */
  messageHandler?: MessageHandler;
  /**
   * How serialized messages are transformed: the manager's, in the same order.
   *
   * @default []
   */
  transformers?: readonly MessageTransformer[];
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
   * The manager sent data that could not be read. Without listeners, it is logged with `console.error`.
   */
  invalidMessage: [error: unknown];
  error: [error: unknown];
}

/**
 * The shard's side of the sharder: it tells the manager its status, and messages the manager and the other shards.
 *
 * @example
 * ```ts
 * const shard = new ShardClient();
 * const client = new GatewayClient({ ...options, ...shard.gatewayOptions });
 * shard.setRequestHandler(async (body) => (body.type === "guildCount" ? client.cache?.guilds.size() : null));
 * client.once("shardReady", () => void shard.ready());
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
   * The ID of the shard, its index in the manager.
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
   * The round trip of the last ping to the manager, in milliseconds; `null` before the first one.
   */
  public latency: number | null = null;

  readonly #transport: ClientTransport;
  readonly #codec: PacketCodec;
  readonly #outgoing = new OutgoingRequests();
  readonly #incoming = new IncomingRequests();
  readonly #ping: NodeJS.Timeout;
  #requestHandler: RequestHandler<{ from: number | null }> | null = null;
  #closeHandler: (() => unknown) | null = null;

  public constructor(options: ShardClientOptions = {}) {
    super();
    const context = options.context ?? ShardClient.context;
    if (!context) throw new Error("This process or thread was not spawned by a ShardManager");

    this.id = context.id;
    this.shards = context.shards;
    this.shardCount = context.shardCount;
    this.requestTimeout = context.requestTimeout;
    this.#codec = new PacketCodec(
      options.messageHandler ?? new JsonMessageHandler(),
      options.transformers ?? [],
    );
    this.#transport = options.transport ?? defaultTransport(context);
    this.#transport.onMessage((data) => void this.#receive(data));
    this.#transport.onDisconnect(() => {
      clearInterval(this.#ping);
      if (this.listenerCount("disconnect") > 0) this.emit("disconnect");
      else this.#transport.exit(0);
    });

    this.#ping = setInterval(() => {
      void this.#write({ op: Op.Ping, sentAt: Date.now() }).catch(() => undefined);
    }, context.pingInterval);
    this.#ping.unref();
    void this.#signal(ShardStatus.Starting);
  }

  /**
   * The gateway shards to connect, to spread into `GatewayClient`'s (or `@discordjs/ws`'s) options.
   */
  public get gatewayOptions(): { shardIds: number[]; shardCount: number } {
    return { shardIds: [...this.shards], shardCount: this.shardCount };
  }

  /**
   * Tells the manager that the shard is ready, e.g. once its gateway shards are. The manager spawns the next shard
   * only then.
   */
  public ready(): Promise<void> {
    return this.#signal(ShardStatus.Ready);
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
   * @param options The timeout and abort signal of the request.
   * @returns The replies, by shard ID.
   */
  public broadcastRequest<Reply = unknown>(
    body: unknown,
    options: RequestOptions = {},
  ): Promise<Reply[]> {
    return this.#outgoing.request(
      (packet) => this.#write(packet),
      { body, to: "all" },
      options.timeout ?? this.requestTimeout,
      options.signal,
    ) as Promise<Reply[]>;
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

  async #signal(status: ShardStatus): Promise<void> {
    this.status = status;
    await this.#write({ op: Op.Signal, status });
  }

  async #stop(status: ShardStatus, code: number): Promise<void> {
    clearInterval(this.#ping);
    await this.#signal(status).catch(() => undefined);
    this.#transport.exit(code);
  }

  async #write(packet: Packet): Promise<void> {
    await this.#transport.send(await this.#codec.encode(packet));
  }

  async #receive(data: ChannelData): Promise<void> {
    let packet: Packet;
    try {
      packet = await this.#codec.decode(data);
    } catch (error) {
      if (this.listenerCount("invalidMessage") > 0) this.emit("invalidMessage", error);
      else console.error("The shard manager sent an invalid message:", error);
      return;
    }

    switch (packet.op) {
      case Op.Pong:
        this.latency = Date.now() - packet.sentAt;
        break;
      case Op.Message:
        this.emit("message", packet.body, packet.from ?? null);
        break;
      case Op.Request:
        await this.#incoming.handle((reply) => this.#write(reply), packet, this.#requestHandler, {
          from: packet.from ?? null,
        });
        break;
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
          if (this.listenerCount("error") > 0) this.emit("error", error);
          else console.error(error);
        }

        await this.exit(0);
        break;
      default:
        break;
    }
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
    onMessage: (listener) => process.on("message", listener as (data: unknown) => void),
    onDisconnect: (listener) => process.once("disconnect", listener),
    exit: (code) => process.exit(code),
  };
}
