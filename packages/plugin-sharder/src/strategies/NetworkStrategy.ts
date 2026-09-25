import { createServer as createNetServer, type Server, type Socket } from "node:net";
import { createServer as createTlsServer, type TlsOptions } from "node:tls";
import {
  Connection,
  FrameType,
  readData,
  tokensMatch,
  type HelloFrame,
  type SpawnFrame,
  type WelcomeFrame,
} from "../network/Connection.js";
import type {
  ChannelStrategy,
  ShardContext,
  ShardTransport,
  ShardTransportEvents,
  SpawnOptions,
} from "./ChannelStrategy.js";

/**
 * The options of {@link NetworkStrategy}.
 */
export interface NetworkStrategyOptions {
  /**
   * The port to listen on for proxies.
   */
  port: number;
  host?: string;
  /**
   * The shared secret proxies authenticate with.
   */
  token: string;
  /**
   * The TLS options (`key`, `cert`, ...) to encrypt the connections, recommended. Left out, the connections are plain
   * TCP: only for trusted networks.
   */
  tls?: TlsOptions;
  /**
   * How long a proxy that lost its connection has to come back before its shards are deemed dead and spawned
   * elsewhere, in milliseconds.
   *
   * @default 30_000
   */
  reconnectGrace?: number;
  heartbeat?: {
    /**
     * @default 15_000
     */
    interval?: number;
    /**
     * @default 45_000
     */
    timeout?: number;
  };
}

/**
 * A proxy connected to a {@link NetworkStrategy}.
 */
export interface ProxyInfo {
  name: string;
  /**
   * The address the proxy connected from.
   */
  host: string | null;
  /**
   * How many shards it runs at most.
   */
  capacity: number;
  /**
   * How many shards it runs.
   */
  load: number;
}

interface Spawn {
  id: number;
  context: ShardContext;
  env: Record<string, string>;
  events: ShardTransportEvents;
  proxy: Proxy | null;
  pid: number | null;
  threadId: number | null;
  exited: boolean;
  exit: Promise<void>;
  resolveExit(): void;
  grace: NodeJS.Timeout | null;
}

interface Proxy {
  name: string;
  host: string | null;
  capacity: number;
  connection: Connection | null;
  spawns: Set<Spawn>;
}

/**
 * Spawns shards on other machines, through {@link ShardManagerProxy}s connecting to the manager: the sharder RFC's
 * network strategy.
 *
 * @remarks
 * Each spawn goes to the connected proxy with the lowest load, within its capacity; without room, it waits for a
 * proxy to connect, or for the spawn timeout. A proxy losing its connection has `reconnectGrace` to come back with its
 * shards, after which they are spawned elsewhere; its stale shards are killed when it comes back later. Proxies
 * coming back are not rebalanced: they take the next spawns.
 */
export class NetworkStrategy implements ChannelStrategy {
  public readonly name = "network";
  public readonly options: NetworkStrategyOptions;

  readonly #proxies = new Map<string, Proxy>();
  readonly #spawns = new Map<number, Spawn>();
  readonly #pending: Spawn[] = [];
  #server: Server | null = null;
  #nextSpawnId = 1;

  public constructor(options: NetworkStrategyOptions) {
    this.options = options;
  }

  /**
   * The proxies, connected or within their reconnect grace.
   */
  public get proxies(): ProxyInfo[] {
    return [...this.#proxies.values()].map((proxy) => ({
      name: proxy.name,
      host: proxy.host,
      capacity: proxy.capacity,
      load: proxy.spawns.size,
    }));
  }

  /**
   * The port the strategy listens on, once initialized.
   */
  public get port(): number | null {
    const address = this.#server?.address();
    return typeof address === "object" && address ? address.port : null;
  }

  /**
   * Drops the connection of a proxy, which reconnects: its shards are kept if it comes back within the grace.
   *
   * @param name The name of the proxy.
   * @returns Whether a proxy of that name was connected.
   */
  public disconnectProxy(name: string): boolean {
    const connection = this.#proxies.get(name)?.connection;
    connection?.close();
    return connection !== undefined && connection !== null;
  }

  public async init(): Promise<void> {
    if (this.#server) return;

    const onSocket = (socket: Socket) => this.#accept(socket);
    const server = this.options.tls
      ? createTlsServer(this.options.tls, onSocket)
      : createNetServer(onSocket);
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(this.options.port, this.options.host, () => {
        server.off("error", reject);
        resolve();
      });
    });
    this.#server = server;
  }

  public async destroy(): Promise<void> {
    for (const proxy of this.#proxies.values()) proxy.connection?.close();
    this.#proxies.clear();
    const server = this.#server;
    this.#server = null;
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  public spawn(
    context: ShardContext,
    events: ShardTransportEvents,
    options: SpawnOptions,
  ): ShardTransport {
    if (context.messageHandler === "raw") {
      throw new TypeError("The raw message handler cannot cross the network");
    }

    let resolveExit!: () => void;
    const spawn: Spawn = {
      id: this.#nextSpawnId++,
      context,
      env: options.env,
      events,
      proxy: null,
      pid: null,
      threadId: null,
      exited: false,
      exit: new Promise((resolve) => {
        resolveExit = resolve;
      }),
      resolveExit: () => resolveExit(),
      grace: null,
    };
    this.#spawns.set(spawn.id, spawn);
    this.#place(spawn);

    return {
      get pid() {
        return spawn.pid;
      },
      get threadId() {
        return spawn.threadId;
      },
      get host() {
        return spawn.proxy?.name ?? null;
      },
      send: async (data) => {
        const connection = spawn.proxy?.connection;
        if (!connection || connection.closed) throw new Error("The shard's proxy is not connected");
        await connection.sendData(spawn.id, data);
      },
      kill: async () => {
        if (spawn.exited) return;
        const connection = spawn.proxy?.connection;
        if (connection && !connection.closed) {
          await connection.sendJson(FrameType.Kill, { spawnId: spawn.id }).catch(() => undefined);
          await Promise.race([
            spawn.exit,
            new Promise((resolve) => setTimeout(resolve, 10_000).unref()),
          ]);
        }

        this.#exit(spawn, null);
      },
    };
  }

  #place(spawn: Spawn): void {
    let best: Proxy | null = null;
    for (const proxy of this.#proxies.values()) {
      if (!proxy.connection || proxy.spawns.size >= proxy.capacity) continue;
      if (!best || proxy.spawns.size / proxy.capacity < best.spawns.size / best.capacity)
        best = proxy;
    }

    if (!best) {
      this.#pending.push(spawn);
      return;
    }

    spawn.proxy = best;
    best.spawns.add(spawn);
    const frame: SpawnFrame = { spawnId: spawn.id, context: spawn.context, env: spawn.env };
    void best.connection!.sendJson(FrameType.Spawn, frame).catch(() => undefined);
  }

  #drain(): void {
    const pending = this.#pending.splice(0);
    for (const spawn of pending) {
      if (!spawn.exited) this.#place(spawn);
    }
  }

  #exit(spawn: Spawn, code: number | null): void {
    if (spawn.exited) return;
    spawn.exited = true;
    if (spawn.grace) clearTimeout(spawn.grace);
    const { proxy } = spawn;
    proxy?.spawns.delete(spawn);
    if (proxy && !proxy.connection && proxy.spawns.size === 0) this.#proxies.delete(proxy.name);
    this.#spawns.delete(spawn.id);
    const index = this.#pending.indexOf(spawn);
    if (index !== -1) this.#pending.splice(index, 1);
    spawn.resolveExit();
    spawn.events.exit(code);
    this.#drain();
  }

  #accept(socket: Socket): void {
    const heartbeat = {
      interval: this.options.heartbeat?.interval ?? 15_000,
      timeout: this.options.heartbeat?.timeout ?? 45_000,
    };
    const connection = new Connection(socket, heartbeat);
    let proxy: Proxy | null = null;

    connection.on("frame", (type, payload) => {
      if (!proxy) {
        proxy = this.#hello(connection, type, payload);
        return;
      }

      this.#frame(proxy, type, payload);
    });
    connection.on("close", () => {
      if (proxy?.connection === connection) this.#lost(proxy);
    });
  }

  #hello(connection: Connection, type: FrameType, payload: Buffer): Proxy | null {
    let hello: HelloFrame;
    try {
      hello = JSON.parse(payload.toString()) as HelloFrame;
    } catch {
      connection.close();
      return null;
    }

    if (type !== FrameType.Hello || !tokensMatch(this.options.token, hello.token)) {
      void connection
        .sendJson(FrameType.Reject, { reason: "Unauthorized" })
        .finally(() => connection.close());
      return null;
    }

    const known = this.#proxies.get(hello.name);
    if (known?.connection && !known.connection.closed) {
      void connection
        .sendJson(FrameType.Reject, { reason: `A proxy named ${hello.name} is connected` })
        .finally(() => connection.close());
      return null;
    }

    const proxy: Proxy = known ?? {
      name: hello.name,
      host: null,
      capacity: hello.capacity,
      connection: null,
      spawns: new Set(),
    };
    proxy.connection = connection;
    proxy.capacity = hello.capacity;
    proxy.host = connection.socket.remoteAddress ?? null;
    this.#proxies.set(proxy.name, proxy);

    // Shards it still runs come back; the ones deemed dead meanwhile are killed.
    const running = new Set(hello.running);
    for (const spawn of proxy.spawns) {
      if (running.has(spawn.id)) {
        if (spawn.grace) clearTimeout(spawn.grace);
        spawn.grace = null;
      } else {
        this.#exit(spawn, null);
      }
    }

    const welcome: WelcomeFrame = {
      kill: hello.running.filter((spawnId) => this.#spawns.get(spawnId)?.proxy !== proxy),
    };
    void connection.sendJson(FrameType.Welcome, welcome).catch(() => undefined);
    this.#drain();
    return proxy;
  }

  #frame(proxy: Proxy, type: FrameType, payload: Buffer): void {
    if (type === FrameType.StringData || type === FrameType.BinaryData) {
      const { spawnId, data } = readData(type, payload);
      const spawn = this.#spawns.get(spawnId);
      if (spawn?.proxy === proxy) spawn.events.message(data);
      return;
    }

    const body = JSON.parse(payload.toString()) as {
      spawnId: number;
      code?: number | null;
      message?: string;
      pid?: number | null;
      threadId?: number | null;
    };
    const spawn = this.#spawns.get(body.spawnId);
    if (spawn?.proxy !== proxy) return;

    switch (type) {
      case FrameType.Spawned:
        spawn.pid = body.pid ?? null;
        spawn.threadId = body.threadId ?? null;
        break;
      case FrameType.Exit:
        this.#exit(spawn, body.code ?? null);
        break;
      case FrameType.Error:
        spawn.events.error(new Error(body.message));
        break;
      default:
        break;
    }
  }

  #lost(proxy: Proxy): void {
    proxy.connection = null;
    const grace = this.options.reconnectGrace ?? 30_000;
    for (const spawn of proxy.spawns) {
      spawn.grace = setTimeout(() => this.#exit(spawn, null), grace);
      spawn.grace.unref();
    }

    if (proxy.spawns.size === 0) this.#proxies.delete(proxy.name);
  }
}
