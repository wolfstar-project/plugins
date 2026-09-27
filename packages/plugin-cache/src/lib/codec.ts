/**
 * Encodes and decodes cached values to and from their stored representation.
 *
 * @remarks
 * `name` is stored alongside every encoded value (see {@link RedisEntityCache}), so switching a cache's codec never
 * breaks reading entries written under a previous one.
 */
export interface CacheCodec {
  readonly name: string;
  encode(value: unknown): Buffer | string;
  decode(data: Buffer | string): unknown;
}

/**
 * The default {@link CacheCodec}: plain JSON, matching the Redis cache's original behavior.
 */
export function jsonCodec(): CacheCodec {
  return {
    name: "json",
    encode(value) {
      return JSON.stringify(value);
    },
    decode(data) {
      return JSON.parse(typeof data === "string" ? data : data.toString("utf8"));
    },
  };
}
