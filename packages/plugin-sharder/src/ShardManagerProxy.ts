import { EventEmitter } from "node:events";
import { connect as connectNet } from "node:net";
import { availableParallelism, hostname } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { connect as connectTls, type ConnectionOptions } from "node:tls";
import { resolveMessageHandler } from "./messages/MessageHandler.js";
import { resolveMessageTransformer } from "./messages/MessageTransformer.js";
import { Op, PacketCodec, type Packet } from "./messages/protocol.js";
import {
  Connection,
  FrameType,
  readData,
  type HelloFrame,
  type SpawnFrame,
  type WelcomeFrame,
} from "./network/Connection.js";
import type {
  ChannelStrategy,
  ShardContext,
  ShardTransport,
} from "./strategies/ChannelStrategy.js";
import { resolveStrategy } from "./strategies/registry.js";
import { ShardUnavailableError } from "./util/errors.js";
import { serializeError } from "./messages/protocol.js";

/**
 * A manager a proxy connects to.
 */
export interface ProxyManagerAddress {
  host: string;
  port: number;
}

/**
 * The options of a {@link ShardManagerProxy}.
 */
export interface ShardManagerProxyOptions {
  /**
   * The managers to connect to, as `{ host, port }` or `"host:port"`. The proxy connects to the first one reachable,
   * and fails over to the next ones when it loses it.
   */
  managers: readonly (ProxyManagerAddress | string)[];
  /**
   * The shared secret of the manager's {@link NetworkStrategy}.
   */
  token: string;
  /**
   * The name of the proxy, unique across the proxies of a manager. It finds its shards back under it after a
   * reconnection.
   *
   * @default `${os.hostname()}:${process.pid}`
   */
  name?: string;
  /**
   * How many shards the proxy runs at most.
   *
   * @default os.availableParallelism()
   */
  capacity?: number;
  /**
   * How the proxy spawns its shards locally: a strategy, or the name of a registered one.
   *
   * @default "fork"
   */
  strategy?: ChannelStrategy | string;
  strategyOptions?: unknown;
  /**
   * Connects with TLS: `true` with the default options, or the options (`ca`, `servername`, ...). Must match the
   * manager's `tls`.
   *
   * @default false
   */
  tls?: boolean | ConnectionOptions;
  /**
   * What the proxy does with its shards when it loses its manager: keep them running and reconnect (the manager
   * takes them back within its `reconnectGrace`), or stop them.
   *
   * @default "keep"
   */
  managerLoss?: "keep" | "exit";
  /**
   * How long to wait between connection attempts, in milliseconds.
   *
   * @default 5_000
   */
  reconnectDelay?: number;
  /**
   * Whether to carry the messages and requests between two shards of this proxy locally, without going through the
   * manager. It decodes their packets with the manager's message handler and transformers, built from the registry:
   * custom ones must be registered in the proxy too.
   *
   * @default true
   */
  localRouting?: boolean;
  heartbeat?: { interval?: number; timeout?: number };
}

/**
 * The events of a {@link ShardManagerProxy}.
 */
export interface ShardManagerProxyEvents {
  /**
   * The proxy connected to a manager.
   */
  connect: [manager: ProxyManagerAddress];
  /**
   * The proxy lost its manager.
   */
  disconnect: [manager: ProxyManagerAddress, error: Error | undefined];
  /**
   * A manager rejected the proxy, e.g. for a wrong token.
   */
  reject: [manager: ProxyManagerAddress, reason: string];
  spawn: [context: ShardContext];
  exit: [context: ShardContext, code: number | null];
  error: [error: unknown];
}

interface LocalShard {
  spawnId: number;
  context: ShardContext;
  transport: ShardTransport;
  exited: boolean;
}

interface Route {
  origin: LocalShard;
  originNonce: number;
  target: LocalShard;
  nonce: number;
}

/**
 * Runs shards for a remote {@link ShardManager} using a {@link NetworkStrategy}: the sharder RFC's
 * `ShardManagerProxy`. It spawns them locally with its own strategy, and carries their messages to the manager.
 *
 * @example
 * ```ts
 * const proxy = new ShardManagerProxy({
 *   managers: ["manager.internal:7000", "manager-backup.internal:7000"],
 *   token: process.env.SHARDER_TOKEN!,
 *   tls: { ca: readFileSync("ca.pem") },
 *   strategy: new ForkStrategy({ path: "./bot.js" }),
 *   capacity: 8,
 * });
 * await proxy.connect();
 * ```
 */
export class ShardManagerProxy extends EventEmitter<ShardManagerProxyEvents> {
  public readonly name: string;
  public readonly capacity: number;
  public readonly strategy: ChannelStrategy;
  public readonly managers: readonly ProxyManagerAddress[];

  readonly #options: ShardManagerProxyOptions;
  readonly #localRouting: boolean;
  readonly #codecs = new Map<string, PacketCodec>();
  readonly #shards = new Map<number, LocalShard>();
  readonly #byChannel = new Map<number, LocalShard>();
  readonly #routes = new Map<number, Route>();
  #connection: Connection | null = null;
  #manager: ProxyManagerAddress | null = null;
  #destroyed = false;
  #nextNonce = 0;

  public constructor(options: ShardManagerProxyOptions) {
    super();
    if (options.managers.length === 0) throw new RangeError("A proxy needs at least one manager");

    this.#options = options;
    this.name = options.name ?? `${hostname()}:${process.pid}`;
    this.capacity = options.capacity ?? availableParallelism();
    this.strategy = resolveStrategy(options.strategy ?? "fork", options.strategyOptions);
    this.managers = options.managers.map(parseAddress);
    this.#localRouting = options.localRouting ?? true;
  }

  /**
   * The manager the proxy is connected to, `null` while it is not.
   */
  public get manager(): ProxyManagerAddress | null {
    return this.#manager;
  }

  /**
   * The contexts of the shards the proxy runs.
   */
  public get shards(): ShardContext[] {
    return [...this.#shards.values()].map((shard) => shard.context);
  }

  /**
   * Connects to the first reachable manager, and keeps reconnecting (failing over to the next managers) whenever the
   * connection is lost, until {@link ShardManagerProxy.destroy}. Resolves once connected the first time.
   */
  public async connect(): Promise<void> {
    await this.strategy.init?.();
    await new Promise<void>((resolve) => {
      this.once("connect", () => resolve());
      void this.#loop();
    });
  }

  /**
   * Stops every shard, and disconnects for good.
   */
  public async destroy(): Promise<void> {
    this.#destroyed = true;
    // Leave the manager first, so it does not hand out new spawns while the shards stop.
    this.#connection?.close();
    await Promise.all([...this.#shards.values()].map((shard) => shard.transport.kill()));
    await this.strategy.destroy?.();
  }

  async #loop(): Promise<void> {
    for (let attempt = 0; !this.#destroyed; ++attempt) {
      const manager = this.managers[attempt % this.managers.length]!;
      const error = await this.#session(manager);
      if (this.#destroyed) return;
      if (error !== undefined) this.emit("disconnect", manager, error ?? undefined);
      await sleep(this.#options.reconnectDelay ?? 5_000);
    }
  }

  // Runs one connection to a manager. Resolves when it ends: `undefined` if it never connected.
  #session(manager: ProxyManagerAddress): Promise<Error | null | undefined> {
    return new Promise((resolve) => {
      const tls = this.#options.tls;
      const socket = tls
        ? connectTls({ ...(tls === true ? {} : tls), host: manager.host, port: manager.port })
        : connectNet({ host: manager.host, port: manager.port });
      const ready = tls ? "secureConnect" : "connect";
      socket.once("error", () => resolve(undefined));

      socket.once(ready, () => {
        socket.removeAllListeners("error");
        const connection = new Connection(socket, {
          interval: this.#options.heartbeat?.interval ?? 15_000,
          timeout: this.#options.heartbeat?.timeout ?? 45_000,
        });
        let welcomed = false;

        connection.on("frame", (type, payload) => {
          if (!welcomed) {
            if (type === FrameType.Welcome) {
              welcomed = true;
              this.#welcome(connection, manager, JSON.parse(payload.toString()) as WelcomeFrame);
            } else if (type === FrameType.Reject) {
              this.emit(
                "reject",
                manager,
                (JSON.parse(payload.toString()) as { reason: string }).reason,
              );
              connection.close();
            }

            return;
          }

          this.#frame(type, payload);
        });
        connection.on("close", (error) => {
          if (this.#connection === connection) {
            this.#connection = null;
            this.#manager = null;
            if (this.#options.managerLoss === "exit") {
              for (const shard of this.#shards.values()) void shard.transport.kill();
            }
          }

          resolve(welcomed ? (error ?? null) : undefined);
        });

        const hello: HelloFrame = {
          token: this.#options.token,
          name: this.name,
          capacity: this.capacity,
          running: [...this.#shards.keys()],
        };
        void connection.sendJson(FrameType.Hello, hello).catch(() => undefined);
      });
    });
  }

  #welcome(connection: Connection, manager: ProxyManagerAddress, welcome: WelcomeFrame): void {
    for (const spawnId of welcome.kill) void this.#shards.get(spawnId)?.transport.kill();
    this.#connection = connection;
    this.#manager = manager;
    this.emit("connect", manager);
  }

  #frame(type: FrameType, payload: Buffer): void {
    if (type === FrameType.StringData || type === FrameType.BinaryData) {
      const { spawnId, data } = readData(type, payload);
      void this.#shards
        .get(spawnId)
        ?.transport.send(data)
        .catch(() => undefined);
      return;
    }

    if (type === FrameType.Spawn) this.#spawn(JSON.parse(payload.toString()) as SpawnFrame);
    else if (type === FrameType.Kill) {
      const { spawnId } = JSON.parse(payload.toString()) as { spawnId: number };
      const shard = this.#shards.get(spawnId);
      if (shard) void shard.transport.kill();
      else void this.#report(FrameType.Exit, { spawnId, code: null });
    }
  }

  #spawn(frame: SpawnFrame): void {
    const context = frame.context as ShardContext;
    let shard: LocalShard | null = null;
    try {
      const transport = this.strategy.spawn(
        context,
        {
          message: (data) => void this.#fromShard(shard!, data),
          exit: (code) => this.#exited(shard!, code),
          error: (error) => {
            void this.#report(FrameType.Error, {
              spawnId: frame.spawnId,
              message: serializeError(error).message,
            });
          },
        },
        { env: frame.env },
      );
      shard = { spawnId: frame.spawnId, context, transport, exited: false };
    } catch (error) {
      void this.#report(FrameType.Error, {
        spawnId: frame.spawnId,
        message: serializeError(error).message,
      });
      void this.#report(FrameType.Exit, { spawnId: frame.spawnId, code: null });
      return;
    }

    this.#shards.set(frame.spawnId, shard);
    this.#byChannel.set(context.id, shard);
    void this.#report(FrameType.Spawned, {
      spawnId: frame.spawnId,
      pid: shard.transport.pid ?? null,
      threadId: shard.transport.threadId ?? null,
    });
    this.emit("spawn", context);
  }

  #exited(shard: LocalShard, code: number | null): void {
    shard.exited = true;
    this.#shards.delete(shard.spawnId);
    if (this.#byChannel.get(shard.context.id) === shard) this.#byChannel.delete(shard.context.id);

    // Requests still waiting on a shard that stopped fail right away.
    for (const [nonce, route] of this.#routes) {
      if (route.target !== shard && route.origin !== shard) continue;
      this.#routes.delete(nonce);
      if (route.target === shard) {
        const error = serializeError(new ShardUnavailableError(shard.context.id, "it stopped"));
        void this.#toShard(route.origin, { op: Op.Reply, nonce: route.originNonce, error });
      }
    }

    void this.#report(FrameType.Exit, { spawnId: shard.spawnId, code });
    this.emit("exit", shard.context, code);
  }

  async #fromShard(shard: LocalShard, data: unknown): Promise<void> {
    if (this.#localRouting && (await this.#route(shard, data))) return;
    await this.#connection?.sendData(shard.spawnId, data).catch(() => undefined);
  }

  // Carries a packet between two local shards. Returns whether it did.
  async #route(origin: LocalShard, data: unknown): Promise<boolean> {
    let packet: Packet;
    try {
      packet = await this.#codec(origin.context).decode(data, { channelId: origin.context.id });
    } catch {
      return false;
    }

    switch (packet.op) {
      case Op.Message: {
        const target = typeof packet.to === "number" ? this.#byChannel.get(packet.to) : undefined;
        if (!target) return false;
        await this.#toShard(target, { op: Op.Message, body: packet.body, from: origin.context.id });
        return true;
      }
      case Op.Request: {
        const target = typeof packet.to === "number" ? this.#byChannel.get(packet.to) : undefined;
        if (!target || packet.system) return false;
        // Nonces of the proxy count down, so they never collide with the manager's.
        const nonce = --this.#nextNonce;
        this.#routes.set(nonce, { origin, originNonce: packet.nonce, target, nonce });
        await this.#toShard(target, {
          op: Op.Request,
          nonce,
          body: packet.body,
          from: origin.context.id,
          timeout: packet.timeout,
        });
        return true;
      }
      case Op.Reply: {
        const route = this.#routes.get(packet.nonce);
        if (!route || route.target !== origin) return false;
        this.#routes.delete(packet.nonce);
        await this.#toShard(route.origin, { ...packet, nonce: route.originNonce });
        return true;
      }
      case Op.Abort: {
        for (const [nonce, route] of this.#routes) {
          if (route.origin !== origin || route.originNonce !== packet.nonce) continue;
          this.#routes.delete(nonce);
          await this.#toShard(route.target, { op: Op.Abort, nonce });
          return true;
        }

        return false;
      }
      default:
        return false;
    }
  }

  async #toShard(shard: LocalShard, packet: Packet): Promise<void> {
    if (shard.exited) return;
    const data = await this.#codec(shard.context).encode(packet, { channelId: shard.context.id });
    await shard.transport.send(data).catch(() => undefined);
  }

  // The manager tells its shards its codec's names: the proxy builds the same codec from them.
  #codec(context: ShardContext): PacketCodec {
    const key = JSON.stringify([context.messageHandler, context.transformers]);
    let codec = this.#codecs.get(key);
    if (!codec) {
      codec = new PacketCodec(
        resolveMessageHandler(context.messageHandler),
        context.transformers.map(resolveMessageTransformer),
      );
      this.#codecs.set(key, codec);
    }

    return codec;
  }

  async #report(type: FrameType, body: unknown): Promise<void> {
    await this.#connection?.sendJson(type, body).catch(() => undefined);
  }
}

function parseAddress(address: ProxyManagerAddress | string): ProxyManagerAddress {
  if (typeof address !== "string") return address;

  const separator = address.lastIndexOf(":");
  const port = Number(address.slice(separator + 1));
  if (separator === -1 || !Number.isInteger(port)) {
    throw new RangeError(`"${address}" is not a host:port address`);
  }

  return { host: address.slice(0, separator).replace(/^\[|\]$/g, ""), port };
}
