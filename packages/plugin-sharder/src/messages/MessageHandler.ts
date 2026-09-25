import { deserialize, serialize } from "node:v8";

/**
 * The data a channel carries between the manager and a shard, once serialized and transformed.
 */
export type ChannelData = string | Uint8Array;

/**
 * Turns the packets exchanged by the manager and its shards into data a channel carries, and back.
 *
 * @remarks
 * The manager tells its shards the name of its handler, and {@link ShardClient} builds the same one from the registry
 * (see {@link registerMessageHandler}): a custom handler must be registered in the shards too.
 */
export interface MessageHandler {
  /**
   * The name of the handler in the registry.
   */
  readonly name: string;
  serialize(packet: unknown): unknown;
  deserialize(data: unknown): unknown;
}

/**
 * Serializes packets as JSON: every body must be JSON-serializable. The default.
 */
export class JsonMessageHandler implements MessageHandler {
  public readonly name = "json";

  public serialize(packet: unknown): string {
    return JSON.stringify(packet);
  }

  public deserialize(data: unknown): unknown {
    return JSON.parse(
      typeof data === "string" ? data : new TextDecoder().decode(data as Uint8Array),
    );
  }
}

/**
 * Serializes packets with `node:v8`, which keeps `Map`s, `Set`s, `Date`s, `BigInt`s, typed arrays, and circular
 * references.
 */
export class V8MessageHandler implements MessageHandler {
  public readonly name = "v8";

  public serialize(packet: unknown): Uint8Array {
    return serialize(packet);
  }

  public deserialize(data: unknown): unknown {
    if (!(data instanceof Uint8Array)) {
      throw new TypeError("V8MessageHandler can only read binary data");
    }

    return deserialize(data);
  }
}

/**
 * Passes packets as they are, for channels that clone values themselves: worker threads, and processes with the
 * `advanced` IPC serialization. It cannot be combined with transformers, nor cross the network.
 */
export class RawMessageHandler implements MessageHandler {
  public readonly name = "raw";

  public serialize(packet: unknown): unknown {
    return packet;
  }

  public deserialize(data: unknown): unknown {
    return data;
  }
}

const handlers = new Map<string, () => MessageHandler>([
  ["json", () => new JsonMessageHandler()],
  ["v8", () => new V8MessageHandler()],
  ["raw", () => new RawMessageHandler()],
]);

/**
 * Registers a message handler under its name, so managers and shards can refer to it by name.
 *
 * @param name The name of the handler, the same as its `name`.
 * @param factory Builds the handler.
 */
export function registerMessageHandler(name: string, factory: () => MessageHandler): void {
  handlers.set(name, factory);
}

/**
 * Resolves a message handler, or the name of a registered one.
 *
 * @param handler The handler, or its name.
 */
export function resolveMessageHandler(handler: MessageHandler | string): MessageHandler {
  if (typeof handler !== "string") return handler;

  const factory = handlers.get(handler);
  if (!factory) throw new RangeError(`There is no message handler named "${handler}"`);
  return factory();
}
