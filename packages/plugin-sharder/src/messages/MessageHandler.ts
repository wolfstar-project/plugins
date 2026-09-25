import { deserialize, serialize } from "node:v8";

/**
 * The data a channel carries between the manager and a shard.
 */
export type ChannelData = string | Uint8Array;

/**
 * Turns the packets exchanged by the manager and its shards into {@link ChannelData}, and back.
 *
 * @remarks
 * The manager and its shards must use the same handler: pass it to both {@link ShardManager} and {@link ShardClient}.
 */
export interface MessageHandler {
  serialize(packet: unknown): ChannelData;
  deserialize(data: ChannelData): unknown;
}

/**
 * Serializes packets as JSON. The default: every body must be JSON-serializable.
 */
export class JsonMessageHandler implements MessageHandler {
  public serialize(packet: unknown): string {
    return JSON.stringify(packet);
  }

  public deserialize(data: ChannelData): unknown {
    return JSON.parse(typeof data === "string" ? data : new TextDecoder().decode(data));
  }
}

/**
 * Serializes packets with the structured clone algorithm of `node:v8`, which keeps `Map`s, `Set`s, `Date`s, `BigInt`s,
 * typed arrays, and circular references.
 */
export class V8MessageHandler implements MessageHandler {
  public serialize(packet: unknown): Uint8Array {
    return serialize(packet);
  }

  public deserialize(data: ChannelData): unknown {
    if (typeof data === "string") throw new TypeError("V8MessageHandler cannot read string data");
    return deserialize(data);
  }
}
