import { EventEmitter } from "node:events";
import {
  connect as connectNet,
  createServer as createNetServer,
  type Server,
  type Socket,
} from "node:net";
import { availableParallelism, hostname } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import {
  connect as connectTls,
  createServer as createTlsServer,
  type ConnectionOptions,
  type TlsOptions,
} from "node:tls";
import { resolveMessageHandler } from "./messages/MessageHandler.js";
import { resolveMessageTransformer } from "./messages/MessageTransformer.js";
import { Op, PacketCodec, ShardStatus, serializeError, type Packet } from "./messages/protocol.js";
import {
  Connection,
  FrameType,
  readData,
  readPeer,
  tokensMatch,
  type DirectoryFrame,
  type HelloFrame,
  type PeerAddress,
  type PeerHeader,
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

/**
 * A manager a proxy connects to.
 */
export interface ProxyManagerAddress {
  host: string;
  port: number;
  /**
   * The manager's token, when it differs from the proxy's `token`.
   */
  token?: string;
  /**
   * The TLS options of this manager, when they differ from the proxy's `tls`.
   */
  tls?: boolean | ConnectionOptions;
}

/**
 * How a proxy accepts connections from other proxies, to carry the messages between their shards directly.
 */
export interface ProxyPeerOptions {
  /**
   * The port to listen on, `0` for any.
   */
  port: number;
  host?: string;
  /**
   * The host other proxies reach this one at.
   *
   * @default host ?? os.hostname()
   */
  advertise?: string;
  /**
   * The shared secret of the peers.
   *
   * @default the proxy's token
   */
  token?: string;
  /**
   * The TLS options of the peer server (`key`, `cert`, ...). Left out, peers talk plain TCP.
   */
  tls?: TlsOptions;
  /**
   * The TLS options to connect to other peers with, `true` for the defaults.
   */
  connectTls?: boolean | ConnectionOptions;
}

/**
 * The options of a {@link ShardManagerProxy}.
 */
export interface ShardManagerProxyOptions {
  /**
   * The managers to connect to, as `{ host, port }` or `"host:port"`.
   */
  managers: readonly (ProxyManagerAddress | string)[];
  /**
   * How the proxy serves its managers:
   *
   * - `"failover"`: one at a time, the first reachable, failing over to the next ones when it loses it.
   * - `"all"`: all of them at once, sharing its capacity, e.g. managers each running part of the gateway shards.
   *
   * @default "failover"
   */
  mode?: "failover" | "all";
  /**
   * The shared secret of the managers' {@link NetworkStrategy}.
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
   * How many shards the proxy runs at most, across all its managers.
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
   * Connects to the managers with TLS: `true` with the default options, or the options (`ca`, `servername`, ...).
   *
   * @default false
   */
  tls?: boolean | ConnectionOptions;
  /**
   * What the proxy does with the shards of a manager it loses: keep them running and reconnect (the manager takes
   * them back within its `reconnectGrace`), or stop them.
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
   * Whether to carry the messages and requests between shards of this proxy (and, with `peer`, of other proxies)
   * without going through the manager. It decodes their packets with the manager's message handler and
   * transformers, built from the registry: custom ones must be registered in the proxy too.
   *
   * @default true
   */
  localRouting?: boolean;
  /**
   * Accepts connections from other proxies, and connects to them, to carry the messages between shards of different
   * proxies directly. Needs `localRouting`.
   */
  peer?: ProxyPeerOptions;
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
   * The proxy lost a manager.
   */
  disconnect: [manager: ProxyManagerAddress, error: Error | undefined];
  /**
   * A manager rejected the proxy, e.g. for a wrong token.
   */
  reject: [manager: ProxyManagerAddress, reason: string];
  spawn: [context: ShardContext];
  exit: [context: ShardContext, code: number | null];
  /**
   * A peer connection to another proxy opened.
   */
  peerConnect: [name: string];
  peerDisconnect: [name: string];
  error: [error: unknown];
}

interface ManagerLink {
  index: number;
  addresses: readonly ProxyManagerAddress[];
  address: ProxyManagerAddress | null;
  connection: Connection | null;
  managerId: string | null;
  directory: Map<number, PeerAddress & { proxy: string }>;
}

interface LocalShard {
  key: string;
  link: ManagerLink;
  scope: string;
  spawnId: number;
  context: ShardContext;
  transport: ShardTransport;
  ready: boolean;
  exited: boolean;
}

interface Peer {
  name: string;
  connection: Connection;
}

type Endpoint = { shard: LocalShard } | { peer: Peer; channel: number };

interface Route {
  origin: Endpoint;
  originNonce: number;
  target: LocalShard;
}

interface PeerRequest {
  origin: LocalShard;
  peer: Peer;
  header: PeerHeader;
}

/**
 * Runs shards for remote {@link ShardManager}s using a {@link NetworkStrategy}: the sharder RFC's
 * `ShardManagerProxy`. It spawns them locally with its own strategy, carries their messages to their manager, and
 * carries the messages between shards of the same manager directly, locally or through peer proxies.
 *
 * @example
 * ```ts
 * const proxy = new ShardManagerProxy({
 *   managers: ["manager.internal:7000", "manager-backup.internal:7000"],
 *   token: process.env.SHARDER_TOKEN!,
 *   tls: { ca: readFileSync("ca.pem") },
 *   strategy: new ForkStrategy({ path: "./bot.js" }),
 *   capacity: 8,
 *   peer: { port: 7001 },
 * });
 * await proxy.connect();
 * ```
 */
export class ShardManagerProxy extends EventEmitter<ShardManagerProxyEvents> {
  public readonly name: string;
  public readonly capacity: number;
  public readonly strategy: ChannelStrategy;
  public readonly managers: readonly ProxyManagerAddress[];
  public readonly mode: "failover" | "all";

  readonly #options: ShardManagerProxyOptions;
  readonly #links: ManagerLink[];
  readonly #shards = new Map<string, LocalShard>();
  readonly #byChannel = new Map<string, LocalShard>();
  readonly #routes = new Map<number, Route>();
  readonly #peerRequests = new Map<string, PeerRequest>();
  readonly #peers = new Map<string, Peer>();
  readonly #connecting = new Set<string>();
  readonly #inbound = new Set<Peer>();
  readonly #codecs = new Map<string, PacketCodec>();
  #peerServer: Server | null = null;
  #peerAddress: PeerAddress | null = null;
  #destroyed = false;
  #nextNonce = 0;

  public constructor(options: ShardManagerProxyOptions) {
    super();
    if (options.managers.length === 0) throw new RangeError("A proxy needs at least one manager");
    if (options.peer && options.localRouting === false) {
      throw new TypeError("Peer routing needs local routing");
    }

    this.#options = options;
    this.name = options.name ?? `${hostname()}:${process.pid}`;
    this.capacity = options.capacity ?? availableParallelism();
    this.strategy = resolveStrategy(options.strategy ?? "fork", options.strategyOptions);
    this.managers = options.managers.map(parseAddress);
    this.mode = options.mode ?? "failover";
    this.#links =
      this.mode === "all"
        ? this.managers.map((address, index) => createLink([address], index))
        : [createLink(this.managers, 0)];
  }

  /**
   * The managers the proxy is connected to.
   */
  public get connectedManagers(): ProxyManagerAddress[] {
    return this.#links.flatMap((link) => (link.connection && link.address ? [link.address] : []));
  }

  /**
   * The manager the proxy is connected to in `"failover"` mode, `null` while it is not.
   */
  public get manager(): ProxyManagerAddress | null {
    return this.connectedManagers[0] ?? null;
  }

  /**
   * The contexts of the shards the proxy runs.
   */
  public get shards(): ShardContext[] {
    return [...this.#shards.values()].map((shard) => shard.context);
  }

  /**
   * Where other proxies reach this one, once connected with `peer`.
   */
  public get peerAddress(): PeerAddress | null {
    return this.#peerAddress;
  }

  /**
   * The names of the proxies this one has a peer connection with.
   */
  public get peers(): string[] {
    return [...new Set([...this.#peers.values(), ...this.#inbound].map((peer) => peer.name))];
  }

  /**
   * Connects to the managers, and keeps reconnecting whenever a connection is lost, until
   * {@link ShardManagerProxy.destroy}. Resolves once connected to a first manager.
   */
  public async connect(): Promise<void> {
    await this.strategy.init?.();
    await this.#listenPeers();
    await new Promise<void>((resolve) => {
      this.once("connect", () => resolve());
      for (const link of this.#links) void this.#loop(link);
    });
  }

  /**
   * Stops every shard, and disconnects for good.
   */
  public async destroy(): Promise<void> {
    this.#destroyed = true;
    // Leave the managers first, so they do not hand out new spawns while the shards stop.
    for (const link of this.#links) link.connection?.close();
    await Promise.all([...this.#shards.values()].map((shard) => shard.transport.kill()));
    for (const peer of [...this.#peers.values(), ...this.#inbound]) peer.connection.close();
    const server = this.#peerServer;
    this.#peerServer = null;
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    await this.strategy.destroy?.();
  }

  async #loop(link: ManagerLink): Promise<void> {
    for (let attempt = 0; !this.#destroyed; ++attempt) {
      const address = link.addresses[attempt % link.addresses.length]!;
      const error = await this.#session(link, address);
      if (this.#destroyed) return;
      if (error !== undefined) this.emit("disconnect", address, error ?? undefined);
      await sleep(this.#options.reconnectDelay ?? 5_000);
    }
  }

  // Runs one connection to a manager. Resolves when it ends: `undefined` if it never connected.
  #session(link: ManagerLink, address: ProxyManagerAddress): Promise<Error | null | undefined> {
    return new Promise((resolve) => {
      const tls = address.tls ?? this.#options.tls;
      const socket = tls
        ? connectTls({ ...(tls === true ? {} : tls), host: address.host, port: address.port })
        : connectNet({ host: address.host, port: address.port });
      socket.once("error", () => resolve(undefined));

      socket.once(tls ? "secureConnect" : "connect", () => {
        socket.removeAllListeners("error");
        const connection = new Connection(socket, this.#heartbeat());
        let welcomed = false;

        connection.on("frame", (type, payload) => {
          if (welcomed) {
            this.#frame(link, type, payload);
          } else if (type === FrameType.Welcome) {
            welcomed = true;
            this.#welcome(
              link,
              address,
              connection,
              JSON.parse(payload.toString()) as WelcomeFrame,
            );
          } else if (type === FrameType.Reject) {
            const { reason } = JSON.parse(payload.toString()) as { reason: string };
            this.emit("reject", address, reason);
            connection.close();
          }
        });
        connection.on("close", (error) => {
          if (link.connection === connection) this.#lost(link);
          resolve(welcomed ? (error ?? null) : undefined);
        });

        const hello: HelloFrame = {
          token: address.token ?? this.#options.token,
          name: this.name,
          capacity: this.capacity,
          available: this.#available(),
          running: [...this.#shards.values()]
            .filter((shard) => shard.link === link)
            .map((shard) => shard.spawnId),
          peer: this.#peerAddress,
        };
        void connection.sendJson(FrameType.Hello, hello).catch(() => undefined);
      });
    });
  }

  #welcome(
    link: ManagerLink,
    address: ProxyManagerAddress,
    connection: Connection,
    welcome: WelcomeFrame,
  ): void {
    const kill = new Set(welcome.kill);
    for (const shard of this.#shards.values()) {
      if (shard.link === link && kill.has(shard.spawnId)) void shard.transport.kill();
    }

    link.connection = connection;
    link.address = address;
    link.managerId = welcome.managerId;
    this.emit("connect", address);
  }

  #lost(link: ManagerLink): void {
    link.connection = null;
    link.directory.clear();
    if (this.#options.managerLoss === "exit") {
      for (const shard of this.#shards.values()) {
        if (shard.link === link) void shard.transport.kill();
      }
    }
  }

  #frame(link: ManagerLink, type: FrameType, payload: Buffer): void {
    switch (type) {
      case FrameType.StringData:
      case FrameType.BinaryData: {
        const { spawnId, data } = readData(type, payload);
        const shard = this.#shards.get(shardKey(link, spawnId));
        void shard?.transport.send(data).catch(() => undefined);
        break;
      }
      case FrameType.Spawn:
        this.#spawn(link, JSON.parse(payload.toString()) as SpawnFrame);
        break;
      case FrameType.Kill: {
        const { spawnId } = JSON.parse(payload.toString()) as { spawnId: number };
        const shard = this.#shards.get(shardKey(link, spawnId));
        if (shard) void shard.transport.kill();
        else void this.#report(link, FrameType.Exit, { spawnId, code: null });
        break;
      }
      case FrameType.Directory: {
        const { entries } = JSON.parse(payload.toString()) as DirectoryFrame;
        link.directory = new Map(entries.map(({ channel, ...entry }) => [channel, entry] as const));
        break;
      }
      default:
        break;
    }
  }

  #spawn(link: ManagerLink, frame: SpawnFrame): void {
    const context = frame.context as ShardContext;
    const key = shardKey(link, frame.spawnId);
    if (this.#shards.size >= this.capacity) {
      void this.#report(link, FrameType.Error, {
        spawnId: frame.spawnId,
        message: "The proxy is full",
      });
      void this.#report(link, FrameType.Exit, { spawnId: frame.spawnId, code: null });
      return;
    }

    let shard: LocalShard | null = null;
    try {
      const transport = this.strategy.spawn(
        context,
        {
          message: (data) => void this.#fromShard(shard!, data),
          exit: (code) => this.#exited(shard!, code),
          error: (error) => {
            void this.#report(link, FrameType.Error, {
              spawnId: frame.spawnId,
              message: serializeError(error).message,
            });
          },
        },
        { env: frame.env },
      );
      shard = {
        key,
        link,
        scope: link.managerId!,
        spawnId: frame.spawnId,
        context,
        transport,
        ready: false,
        exited: false,
      };
    } catch (error) {
      void this.#report(link, FrameType.Error, {
        spawnId: frame.spawnId,
        message: serializeError(error).message,
      });
      void this.#report(link, FrameType.Exit, { spawnId: frame.spawnId, code: null });
      return;
    }

    this.#shards.set(key, shard);
    this.#byChannel.set(channelKey(shard.scope, context.id), shard);
    void this.#report(link, FrameType.Spawned, {
      spawnId: frame.spawnId,
      pid: shard.transport.pid ?? null,
      threadId: shard.transport.threadId ?? null,
    });
    this.#reportLoad();
    this.emit("spawn", context);
  }

  #exited(shard: LocalShard, code: number | null): void {
    shard.exited = true;
    this.#shards.delete(shard.key);
    const key = channelKey(shard.scope, shard.context.id);
    if (this.#byChannel.get(key) === shard) this.#byChannel.delete(key);

    // Requests still waiting on a shard that stopped fail right away; its own requests are abandoned.
    const stopped = serializeError(new ShardUnavailableError(shard.context.id, "it stopped"));
    for (const [nonce, route] of this.#routes) {
      if (route.target === shard) {
        this.#routes.delete(nonce);
        void this.#toEndpoint(route.origin, shard, {
          op: Op.Reply,
          nonce: route.originNonce,
          error: stopped,
        });
      } else if ("shard" in route.origin && route.origin.shard === shard) {
        this.#routes.delete(nonce);
        void this.#toShard(route.target, { op: Op.Abort, nonce });
      }
    }

    // Nobody waits for the replies of the stopped shard's requests to peers anymore: the peers abort them.
    for (const [requestKey, request] of this.#peerRequests) {
      if (request.origin !== shard) continue;
      this.#peerRequests.delete(requestKey);
      const nonce = Number(requestKey.slice(requestKey.lastIndexOf(":") + 1));
      void this.#abortPeerRequest(request, nonce);
    }

    void this.#report(shard.link, FrameType.Exit, { spawnId: shard.spawnId, code });
    this.#reportLoad();
    this.emit("exit", shard.context, code);
  }

  async #fromShard(shard: LocalShard, data: unknown): Promise<void> {
    if (this.#options.localRouting !== false) {
      let packet: Packet | null = null;
      try {
        packet = await this.#codec(shard.context).decode(data, { channelId: shard.context.id });
      } catch {
        // Not readable here: the manager reports it.
      }

      if (packet?.op === Op.Signal) {
        const ready = packet.status === ShardStatus.Ready;
        if (ready !== shard.ready) {
          shard.ready = ready;
          void this.#report(shard.link, FrameType.Status, { spawnId: shard.spawnId, ready });
        }
      } else if (packet && (await this.#route(shard, packet, data))) {
        return;
      }
    }

    await shard.link.connection?.sendData(shard.spawnId, data).catch(() => undefined);
  }

  // Carries a packet of a local shard to another shard of the same manager. Returns whether it did.
  async #route(origin: LocalShard, packet: Packet, data: unknown): Promise<boolean> {
    switch (packet.op) {
      case Op.Message:
      case Op.Request: {
        if (typeof packet.to !== "number" || (packet.op === Op.Request && packet.system))
          return false;

        const local = this.#byChannel.get(channelKey(origin.scope, packet.to));
        if (local?.ready) {
          await this.#deliver({ shard: origin }, origin.context.id, local, packet);
          return true;
        }

        const entry = origin.link.directory.get(packet.to);
        if (!entry || entry.proxy === this.name || !isChannelData(data)) return false;
        const peer = this.#peer(entry);
        if (!peer) return false;

        const header: PeerHeader = {
          scope: origin.scope,
          origin: origin.context.id,
          target: packet.to,
          binary: typeof data !== "string",
        };
        if (packet.op === Op.Request) {
          this.#peerRequests.set(`${origin.key}:${packet.nonce}`, { origin, peer, header });
        }

        await peer.connection.sendPeer(header, data).catch(() => undefined);
        return true;
      }
      case Op.Reply: {
        const route = this.#routes.get(packet.nonce);
        if (!route || route.target !== origin) return false;
        this.#routes.delete(packet.nonce);
        await this.#toEndpoint(route.origin, origin, { ...packet, nonce: route.originNonce });
        return true;
      }
      case Op.Abort: {
        for (const [nonce, route] of this.#routes) {
          if (!("shard" in route.origin) || route.origin.shard !== origin) continue;
          if (route.originNonce !== packet.nonce) continue;
          this.#routes.delete(nonce);
          await this.#toShard(route.target, { op: Op.Abort, nonce });
          return true;
        }

        const request = this.#peerRequests.get(`${origin.key}:${packet.nonce}`);
        if (!request || !isChannelData(data)) return false;
        this.#peerRequests.delete(`${origin.key}:${packet.nonce}`);
        await request.peer.connection
          .sendPeer({ ...request.header, binary: typeof data !== "string" }, data)
          .catch(() => undefined);
        return true;
      }
      default:
        return false;
    }
  }

  // Delivers a message or request to a local shard, from a local shard or a peer's.
  async #deliver(
    origin: Endpoint,
    from: number,
    target: LocalShard,
    packet: Packet,
  ): Promise<void> {
    if (packet.op === Op.Message) {
      await this.#toShard(target, { op: Op.Message, body: packet.body, from });
      return;
    }

    if (packet.op !== Op.Request) return;
    // Nonces of the proxy count down, so they never collide with the manager's.
    const nonce = --this.#nextNonce;
    this.#routes.set(nonce, { origin, originNonce: packet.nonce, target });
    await this.#toShard(target, {
      op: Op.Request,
      nonce,
      body: packet.body,
      from,
      timeout: packet.timeout,
    });
  }

  async #fromPeer(peer: Peer, header: PeerHeader, data: string | Uint8Array): Promise<void> {
    if (header.bounce) {
      // The peer could not deliver a packet of one of our shards: it goes through the manager after all.
      // The request is sent again through the manager, whose reply the shard still waits for: only the peer route
      // of this very request is gone, not the ones of the shard's other requests to this peer.
      const origin = this.#byChannel.get(channelKey(header.scope, header.origin));
      if (!origin) return;
      const packet = await this.#codec(origin.context)
        .decode(data, { channelId: origin.context.id })
        .catch(() => null);
      if (packet?.op === Op.Request) this.#peerRequests.delete(`${origin.key}:${packet.nonce}`);

      await origin.link.connection?.sendData(origin.spawnId, data).catch(() => undefined);
      return;
    }

    const target = this.#byChannel.get(channelKey(header.scope, header.target));
    let packet: Packet | null = null;
    if (target) {
      try {
        packet = await this.#codec(target.context).decode(data, { channelId: header.origin });
      } catch {
        packet = null;
      }
    }

    if (!target || !packet) {
      await peer.connection.sendPeer({ ...header, bounce: true }, data).catch(() => undefined);
      return;
    }

    switch (packet.op) {
      case Op.Message:
      case Op.Request:
        if (!target.ready) {
          await peer.connection.sendPeer({ ...header, bounce: true }, data).catch(() => undefined);
          return;
        }

        await this.#deliver({ peer, channel: header.origin }, header.origin, target, packet);
        break;
      case Op.Abort:
        for (const [nonce, route] of this.#routes) {
          if (!("peer" in route.origin) || route.origin.peer !== peer) continue;
          if (route.origin.channel !== header.origin || route.originNonce !== packet.nonce)
            continue;
          this.#routes.delete(nonce);
          await this.#toShard(route.target, { op: Op.Abort, nonce });
          break;
        }

        break;
      case Op.Reply:
        // The reply to a request one of our shards sent to the peer: its nonce is already the shard's.
        this.#peerRequests.delete(`${target.key}:${packet.nonce}`);
        await this.#toShard(target, packet);
        break;
      default:
        break;
    }
  }

  async #abortPeerRequest(request: PeerRequest, nonce: number): Promise<void> {
    const data = await this.#codec(request.origin.context).encode(
      { op: Op.Abort, nonce },
      { channelId: request.origin.context.id },
    );
    if (!isChannelData(data)) return;
    await request.peer.connection
      .sendPeer({ ...request.header, binary: typeof data !== "string" }, data)
      .catch(() => undefined);
  }

  async #toEndpoint(endpoint: Endpoint, from: LocalShard, packet: Packet): Promise<void> {
    if ("shard" in endpoint) {
      await this.#toShard(endpoint.shard, packet);
      return;
    }

    const data = await this.#codec(from.context).encode(packet, { channelId: from.context.id });
    if (!isChannelData(data)) return;
    const header: PeerHeader = {
      scope: from.scope,
      origin: from.context.id,
      target: endpoint.channel,
      binary: typeof data !== "string",
    };
    await endpoint.peer.connection.sendPeer(header, data).catch(() => undefined);
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

  async #listenPeers(): Promise<void> {
    const options = this.#options.peer;
    if (!options || this.#peerServer) return;

    const onSocket = (socket: Socket) => this.#acceptPeer(socket);
    const server = options.tls ? createTlsServer(options.tls, onSocket) : createNetServer(onSocket);
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(options.port, options.host, () => {
        server.off("error", reject);
        resolve();
      });
    });

    const address = server.address();
    this.#peerServer = server;
    this.#peerAddress = {
      host: options.advertise ?? options.host ?? hostname(),
      port: typeof address === "object" && address ? address.port : options.port,
    };
  }

  #acceptPeer(socket: Socket): void {
    const connection = new Connection(socket, this.#heartbeat());
    let peer: Peer | null = null;
    connection.on("frame", (type, payload) => {
      if (peer) {
        if (type === FrameType.PeerPacket) {
          const { header, data } = readPeer(payload);
          void this.#fromPeer(peer, header, data);
        }

        return;
      }

      const hello =
        type === FrameType.PeerHello
          ? (JSON.parse(payload.toString()) as { token: string; name: string })
          : null;
      if (!hello || !tokensMatch(this.#peerToken(), hello.token)) {
        connection.close();
        return;
      }

      peer = { name: hello.name, connection };
      this.#inbound.add(peer);
      void connection.send(FrameType.PeerWelcome).catch(() => undefined);
      this.emit("peerConnect", peer.name);
    });
    connection.on("close", () => {
      if (!peer) return;
      this.#inbound.delete(peer);
      this.#peerLost(peer);
    });
  }

  // The peer connection to a proxy, or `null` while it opens: meanwhile, packets go through the manager.
  #peer(entry: PeerAddress & { proxy: string }): Peer | null {
    const key = `${entry.host}:${entry.port}`;
    const peer = this.#peers.get(key);
    if (peer && !peer.connection.closed) return peer;

    // A connection the other proxy opened works both ways.
    for (const inbound of this.#inbound) {
      if (inbound.name === entry.proxy && !inbound.connection.closed) return inbound;
    }

    if (this.#connecting.has(key) || this.#destroyed) return null;

    this.#connecting.add(key);
    const options = this.#options.peer;
    const tls = options?.connectTls;
    const socket = tls
      ? connectTls({ ...(tls === true ? {} : tls), host: entry.host, port: entry.port })
      : connectNet({ host: entry.host, port: entry.port });
    socket.once("error", () => this.#connecting.delete(key));
    socket.once(tls ? "secureConnect" : "connect", () => {
      socket.removeAllListeners("error");
      const connection = new Connection(socket, this.#heartbeat());
      const opened: Peer = { name: entry.proxy, connection };
      connection.on("frame", (type, payload) => {
        if (type === FrameType.PeerWelcome) {
          this.#connecting.delete(key);
          this.#peers.set(key, opened);
          this.emit("peerConnect", opened.name);
        } else if (type === FrameType.PeerPacket) {
          const { header, data } = readPeer(payload);
          void this.#fromPeer(opened, header, data);
        }
      });
      connection.on("close", () => {
        this.#connecting.delete(key);
        if (this.#peers.get(key) === opened) this.#peers.delete(key);
        this.#peerLost(opened);
      });
      void connection
        .sendJson(FrameType.PeerHello, { token: this.#peerToken(), name: this.name })
        .catch(() => undefined);
    });
    return null;
  }

  #peerLost(peer: Peer): void {
    // Requests of our shards the peer will never answer fail right away; the peer's requests are aborted.
    for (const [key, request] of this.#peerRequests) {
      if (request.peer !== peer) continue;
      this.#peerRequests.delete(key);
      const nonce = Number(key.slice(key.lastIndexOf(":") + 1));
      const error = serializeError(
        new ShardUnavailableError(request.header.target, "its proxy is unreachable"),
      );
      void this.#toShard(request.origin, { op: Op.Reply, nonce, error });
    }

    for (const [nonce, route] of this.#routes) {
      if (!("peer" in route.origin) || route.origin.peer !== peer) continue;
      this.#routes.delete(nonce);
      void this.#toShard(route.target, { op: Op.Abort, nonce });
    }

    this.emit("peerDisconnect", peer.name);
  }

  #available(): number {
    return Math.max(this.capacity - this.#shards.size, 0);
  }

  #reportLoad(): void {
    for (const link of this.#links)
      void this.#report(link, FrameType.Load, { available: this.#available() });
  }

  async #report(link: ManagerLink, type: FrameType, body: unknown): Promise<void> {
    await link.connection?.sendJson(type, body).catch(() => undefined);
  }

  #peerToken(): string {
    return this.#options.peer?.token ?? this.#options.token;
  }

  #heartbeat(): { interval: number; timeout: number } {
    return {
      interval: this.#options.heartbeat?.interval ?? 15_000,
      timeout: this.#options.heartbeat?.timeout ?? 45_000,
    };
  }
}

function createLink(addresses: readonly ProxyManagerAddress[], index: number): ManagerLink {
  return {
    index,
    addresses,
    address: null,
    connection: null,
    managerId: null,
    directory: new Map(),
  };
}

function shardKey(link: ManagerLink, spawnId: number): string {
  return `${link.index}:${spawnId}`;
}

function channelKey(scope: string, channel: number): string {
  return `${scope}:${channel}`;
}

function isChannelData(data: unknown): data is string | Uint8Array {
  return typeof data === "string" || data instanceof Uint8Array;
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
