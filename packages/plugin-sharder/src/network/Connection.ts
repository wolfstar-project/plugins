import { createHash, timingSafeEqual } from "node:crypto";
import { EventEmitter } from "node:events";
import type { Socket } from "node:net";

/**
 * The frames exchanged between a manager and its proxies, and between proxies.
 *
 * @internal
 */
export const FrameType = {
  /**
   * Proxy → manager, JSON {@link HelloFrame}: authenticates, and lists the shards still running.
   */
  Hello: 0,
  /**
   * Manager → proxy, JSON {@link WelcomeFrame}: accepts the proxy, and lists the running shards to kill.
   */
  Welcome: 1,
  /**
   * Manager → proxy, JSON `{ reason }`: rejects the proxy.
   */
  Reject: 2,
  /**
   * Manager → proxy, JSON {@link SpawnFrame}.
   */
  Spawn: 3,
  /**
   * Proxy → manager, JSON `{ spawnId, pid, threadId }`: the shard was spawned.
   */
  Spawned: 4,
  /**
   * Manager → proxy, JSON `{ spawnId }`.
   */
  Kill: 5,
  /**
   * Proxy → manager, JSON `{ spawnId, code }`.
   */
  Exit: 6,
  /**
   * Proxy → manager, JSON `{ spawnId, message }`.
   */
  Error: 7,
  /**
   * Both ways: a spawn ID (u32), then the string data.
   */
  StringData: 8,
  /**
   * Both ways: a spawn ID (u32), then the binary data.
   */
  BinaryData: 9,
  Heartbeat: 10,
  /**
   * Proxy → manager, JSON `{ available }`: how many more shards the proxy takes, across all its managers.
   */
  Load: 11,
  /**
   * Proxy → manager, JSON `{ spawnId, ready }`: whether a shard is ready, for the peer directory.
   */
  Status: 12,
  /**
   * Manager → proxy, JSON {@link DirectoryFrame}: which proxy runs which ready shard, for peer routing.
   */
  Directory: 13,
  /**
   * Proxy → proxy, JSON `{ token, name }`: opens a peer connection.
   */
  PeerHello: 20,
  /**
   * Proxy → proxy, empty: accepts a peer connection.
   */
  PeerWelcome: 21,
  /**
   * Proxy → proxy: a {@link PeerHeader} (length-prefixed JSON), then the packet as a shard encoded it.
   */
  PeerPacket: 22,
} as const;

/**
 * @internal
 */
export type FrameType = (typeof FrameType)[keyof typeof FrameType];

/**
 * @internal
 */
export interface HelloFrame {
  token: string;
  name: string;
  capacity: number;
  available: number;
  running: number[];
  /**
   * Where other proxies reach this one, when it accepts peers.
   */
  peer: PeerAddress | null;
}

/**
 * Where a proxy accepts peer connections.
 */
export interface PeerAddress {
  host: string;
  port: number;
}

/**
 * @internal
 */
export interface WelcomeFrame {
  kill: number[];
  /**
   * The ID of the manager: shards of different managers are never routed to each other.
   */
  managerId: string;
}

/**
 * @internal
 */
export interface DirectoryFrame {
  entries: { channel: number; proxy: string; host: string; port: number }[];
}

/**
 * The routing header of a peer packet.
 *
 * @internal
 */
export interface PeerHeader {
  /**
   * The ID of the manager of both shards.
   */
  scope: string;
  /**
   * The channel of the shard the packet comes from.
   */
  origin: number;
  /**
   * The channel of the shard the packet goes to.
   */
  target: number;
  binary: boolean;
  /**
   * Sent back because the target is not here or not ready: the sender relays it through the manager instead.
   */
  bounce?: boolean;
}

/**
 * @internal
 */
export interface SpawnFrame {
  spawnId: number;
  context: unknown;
  env: Record<string, string>;
}

/**
 * The events of a {@link Connection}.
 *
 * @internal
 */
export interface ConnectionEvents {
  frame: [type: FrameType, payload: Buffer];
  close: [error?: Error];
}

/**
 * Carries length-prefixed frames over a socket, with heartbeats.
 *
 * @internal
 */
export class Connection extends EventEmitter<ConnectionEvents> {
  public readonly socket: Socket;
  #buffer: Buffer = Buffer.alloc(0);
  #closed = false;
  readonly #heartbeat: NodeJS.Timeout;
  readonly #watchdog: NodeJS.Timeout;

  public constructor(socket: Socket, heartbeat: { interval: number; timeout: number }) {
    super();
    this.socket = socket;
    socket.setNoDelay(true);
    socket.on("data", (chunk: Buffer) => this.#read(chunk));
    socket.on("error", (error) => this.close(error));
    socket.on("close", () => this.close());

    this.#heartbeat = setInterval(
      () => void this.send(FrameType.Heartbeat).catch(() => undefined),
      heartbeat.interval,
    );
    this.#heartbeat.unref();
    this.#watchdog = setTimeout(
      () => this.close(new Error(`No heartbeat for ${heartbeat.timeout}ms`)),
      heartbeat.timeout,
    );
    this.#watchdog.unref();
  }

  public get closed(): boolean {
    return this.#closed;
  }

  public send(type: FrameType, payload: Uint8Array = Buffer.alloc(0)): Promise<void> {
    if (this.#closed) return Promise.reject(new Error("The connection is closed"));

    const header = Buffer.allocUnsafe(5);
    header.writeUInt32BE(payload.length + 1, 0);
    header.writeUInt8(type, 4);
    return new Promise((resolve, reject) => {
      this.socket.write(Buffer.concat([header, payload]), (error) =>
        error ? reject(error) : resolve(),
      );
    });
  }

  public sendJson(type: FrameType, value: unknown): Promise<void> {
    return this.send(type, Buffer.from(JSON.stringify(value)));
  }

  public sendPeer(header: PeerHeader, data: string | Uint8Array): Promise<void> {
    const json = Buffer.from(JSON.stringify(header));
    const length = Buffer.allocUnsafe(4);
    length.writeUInt32BE(json.length, 0);
    const body = typeof data === "string" ? Buffer.from(data) : data;
    return this.send(FrameType.PeerPacket, Buffer.concat([length, json, body]));
  }

  public sendData(spawnId: number, data: unknown): Promise<void> {
    const prefix = Buffer.allocUnsafe(4);
    prefix.writeUInt32BE(spawnId, 0);
    if (typeof data === "string") {
      return this.send(FrameType.StringData, Buffer.concat([prefix, Buffer.from(data)]));
    }

    if (data instanceof Uint8Array) {
      return this.send(FrameType.BinaryData, Buffer.concat([prefix, data]));
    }

    return Promise.reject(
      new TypeError(
        "Only string or binary data crosses the network: the raw message handler cannot",
      ),
    );
  }

  public close(error?: Error): void {
    if (this.#closed) return;
    this.#closed = true;
    clearInterval(this.#heartbeat);
    clearTimeout(this.#watchdog);
    this.socket.destroy();
    this.emit("close", error);
  }

  #read(chunk: Buffer): void {
    this.#watchdog.refresh();
    this.#buffer = this.#buffer.length === 0 ? chunk : Buffer.concat([this.#buffer, chunk]);
    while (this.#buffer.length >= 4) {
      const length = this.#buffer.readUInt32BE(0);
      if (this.#buffer.length < 4 + length) return;

      const type = this.#buffer.readUInt8(4) as FrameType;
      const payload = this.#buffer.subarray(5, 4 + length);
      this.#buffer = this.#buffer.subarray(4 + length);
      if (type !== FrameType.Heartbeat) this.emit("frame", type, payload);
    }
  }
}

/**
 * Reads the spawn ID and the data of a data frame.
 *
 * @internal
 */
export function readData(
  type: FrameType,
  payload: Buffer,
): { spawnId: number; data: string | Uint8Array } {
  const spawnId = payload.readUInt32BE(0);
  const body = payload.subarray(4);
  return {
    spawnId,
    data: type === FrameType.StringData ? body.toString() : new Uint8Array(body),
  };
}

/**
 * Reads the header and the data of a peer packet.
 *
 * @internal
 */
export function readPeer(payload: Buffer): { header: PeerHeader; data: string | Uint8Array } {
  const length = payload.readUInt32BE(0);
  const header = JSON.parse(payload.subarray(4, 4 + length).toString()) as PeerHeader;
  const body = payload.subarray(4 + length);
  return { header, data: header.binary ? new Uint8Array(body) : body.toString() };
}

/**
 * Compares two tokens in constant time.
 *
 * @internal
 */
export function tokensMatch(expected: string, actual: unknown): boolean {
  if (typeof actual !== "string") return false;
  // Hashing gives both the same length, which timingSafeEqual needs.
  return timingSafeEqual(sha256(expected), sha256(actual));
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}
