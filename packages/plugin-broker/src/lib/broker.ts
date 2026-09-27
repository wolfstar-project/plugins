import { jsonCodec, type CacheCodec } from "@wolfstar/plugin-cache";
import type { BrokerRedisClientLike } from "./redis.js";

export interface CreateBrokerOptions {
  /**
   * The Redis client to use, e.g. an [`ioredis`](https://github.com/redis/ioredis) instance.
   */
  redis: BrokerRedisClientLike;
  /**
   * The Redis key of the stream to publish to.
   */
  stream: string;
  /**
   * Trims the stream to approximately this many entries on every publish (`XADD ... MAXLEN ~`). Left unset, the
   * stream is never trimmed.
   */
  maxLength?: number;
  /**
   * The codec used to encode published payloads.
   *
   * @remarks
   * Every consumer of this stream must be configured with the same codec.
   *
   * @default jsonCodec()
   */
  codec?: CacheCodec;
}

export interface Broker {
  /**
   * Publishes an event to the stream.
   * @param event The event name, read by {@link BrokerListener} pieces to route the payload.
   * @param payload The payload, encoded with the configured codec.
   * @returns The ID of the published entry.
   */
  publish(event: string, payload: unknown): Promise<string>;
}

/**
 * Creates a {@link Broker}, publishing events to a Redis stream for {@link BrokerConsumer}s to read.
 *
 * @param options The options for the broker.
 */
export function createBroker(options: CreateBrokerOptions): Broker {
  const { redis, stream, maxLength, codec = jsonCodec() } = options;

  return {
    async publish(event, payload) {
      const encoded = codec.encode(payload);
      const bytes = typeof encoded === "string" ? Buffer.from(encoded, "utf8") : encoded;
      const fields = ["event", event, "payload", bytes.toString("base64")];

      const id =
        maxLength === undefined
          ? await redis.xadd(stream, "*", ...fields)
          : await redis.xadd(stream, "MAXLEN", "~", maxLength, "*", ...fields);

      // XADD only resolves to `null` with NOMKSTREAM, which this broker never sets.
      return id!;
    },
  };
}
