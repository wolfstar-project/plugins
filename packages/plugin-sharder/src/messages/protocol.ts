import type { ChannelData, MessageHandler } from "./MessageHandler.js";
import type { MessageTransformer } from "./MessageTransformer.js";

/**
 * The lifecycle status a shard signals to its manager.
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
 * The error of a failed request, as sent over the channel.
 *
 * @internal
 */
export interface SerializedError {
  name: string;
  message: string;
}

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
  private readonly handler: MessageHandler;
  private readonly transformers: readonly MessageTransformer[];

  public constructor(handler: MessageHandler, transformers: readonly MessageTransformer[]) {
    this.handler = handler;
    this.transformers = transformers;
  }

  public async encode(packet: Packet): Promise<ChannelData> {
    let data = this.handler.serialize(packet);
    for (const transformer of this.transformers) data = await transformer.write(data);
    return data;
  }

  public async decode(data: ChannelData): Promise<Packet> {
    for (let index = this.transformers.length - 1; index >= 0; --index) {
      data = await this.transformers[index]!.read(data);
    }

    const packet = this.handler.deserialize(data);
    if (!isPacket(packet)) throw new TypeError("The message is not a sharder packet");
    return packet;
  }
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
