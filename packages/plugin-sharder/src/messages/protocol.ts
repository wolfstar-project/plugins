import type { ChannelData, MessageHandler } from "./MessageHandler.js";
import type { MessageTransformer, TransformerContext } from "./MessageTransformer.js";

/**
 * The lifecycle status of a shard, as it signals it to its manager.
 */
export const ShardStatus = {
  /**
   * Not spawned yet, or stopped.
   */
  Idle: "Idle",
  /**
   * Spawned, and not ready to answer yet.
   */
  Starting: "Starting",
  /**
   * Fully operative.
   */
  Ready: "Ready",
  /**
   * Running, but disconnected from what it serves, e.g. the gateway.
   */
  Disconnected: "Disconnected",
  /**
   * Running, and reconnecting to what it serves.
   */
  Reconnecting: "Reconnecting",
  /**
   * Shutting down, not to be restarted.
   */
  Exiting: "Exiting",
  /**
   * Shutting down, to be restarted.
   */
  Restarting: "Restarting",
} as const;

export type ShardStatus = (typeof ShardStatus)[keyof typeof ShardStatus];

/**
 * Where a message or a request goes: a shard's ID, or `"all"` for every shard. Left out, it goes to the manager.
 */
export type ShardTarget = number | "all";

/**
 * The operation of a packet.
 *
 * @internal
 */
export const Op = {
  Signal: 0,
  Ping: 1,
  Pong: 2,
  Message: 3,
  Request: 4,
  Reply: 5,
  Abort: 6,
  Close: 7,
} as const;

/**
 * @internal
 */
export type Op = (typeof Op)[keyof typeof Op];

const Ops = new Set<number>(Object.values(Op));

/**
 * The requests the sharder itself sends, rather than the application.
 *
 * - `identify` (shard → manager): waits for the turn of a gateway shard to identify. Body: the gateway shard ID.
 * - `gatewayInformation` (shard → manager): the manager's cached `GET /gateway/bot`.
 * - `control` (shard → manager): starts, closes, or restarts shards or gateway shards. Body: {@link ControlRequest}.
 * - `startShard` / `closeShard` (manager → shard): starts or closes a gateway shard. Body: the gateway shard ID.
 *
 * @internal
 */
export type SystemCall =
  | "identify"
  | "gatewayInformation"
  | "control"
  | "startShard"
  | "closeShard";

/**
 * What a shard asks its manager to start, close, or restart.
 */
export interface ControlRequest {
  action: "start" | "close" | "restart";
  /**
   * A shard (`{ channel }`, or `"all"`), or a gateway shard (`{ shard }`).
   */
  target: { channel: ShardTarget } | { shard: number };
}

/**
 * The error of a failed request, as sent over the channel.
 *
 * @internal
 */
export interface SerializedError {
  name: string;
  message: string;
}

/**
 * The outcome of one request of a partial broadcast, as sent over the channel.
 *
 * @internal
 */
export type SerializedSettledResult =
  | { status: "fulfilled"; value: unknown }
  | { status: "rejected"; reason: SerializedError };

/**
 * The packets exchanged between the manager and its shards, before serialization.
 *
 * @internal
 */
export type Packet =
  | { op: typeof Op.Signal; status: ShardStatus }
  | { op: typeof Op.Ping; sentAt: number }
  | { op: typeof Op.Pong; sentAt: number }
  | { op: typeof Op.Message; body: unknown; to?: ShardTarget; from?: number | null }
  | {
      op: typeof Op.Request;
      nonce: number;
      body: unknown;
      to?: ShardTarget;
      from?: number | null;
      timeout?: number;
      /**
       * For broadcasts: reply with every outcome rather than rejecting on the first failure.
       */
      partial?: boolean;
      system?: SystemCall;
    }
  | { op: typeof Op.Reply; nonce: number; body?: unknown; error?: SerializedError }
  | { op: typeof Op.Abort; nonce: number }
  | { op: typeof Op.Close };

/**
 * Serializes packets with a {@link MessageHandler}, then runs them through the {@link MessageTransformer}s, and the
 * other way around.
 *
 * @internal
 */
export class PacketCodec {
  public readonly handler: MessageHandler;
  public readonly transformers: readonly MessageTransformer[];

  public constructor(handler: MessageHandler, transformers: readonly MessageTransformer[]) {
    this.handler = handler;
    this.transformers = transformers;
  }

  public async encode(packet: Packet, context: TransformerContext): Promise<unknown> {
    let data = this.handler.serialize(packet);
    for (const transformer of this.transformers) {
      data = await transformer.write(assertChannelData(data), context);
    }

    return data;
  }

  public async decode(data: unknown, context: TransformerContext): Promise<Packet> {
    for (let index = this.transformers.length - 1; index >= 0; --index) {
      data = await this.transformers[index]!.read(assertChannelData(data), context);
    }

    const packet = this.handler.deserialize(data);
    if (!isPacket(packet)) throw new TypeError("The message is not a sharder packet");
    return packet;
  }
}

function assertChannelData(data: unknown): ChannelData {
  if (typeof data === "string" || data instanceof Uint8Array) return data;
  throw new TypeError("Transformers need a message handler serializing to strings or bytes");
}

function isPacket(value: unknown): value is Packet {
  return (
    typeof value === "object" && value !== null && Ops.has((value as { op?: unknown }).op as number)
  );
}

/**
 * Serializes an error to send it over the channel.
 *
 * @internal
 */
export function serializeError(error: unknown): SerializedError {
  return error instanceof Error
    ? { name: error.name, message: error.message }
    : { name: "Error", message: String(error) };
}
