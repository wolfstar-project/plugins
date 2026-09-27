/**
 * The subset of the [`ioredis`](https://github.com/redis/ioredis) client API the broker relies on for Redis
 * Streams. An `ioredis` `Redis` or `Cluster` instance satisfies it, as can any other client exposing the same
 * commands.
 */
export interface BrokerRedisClientLike {
  xadd(key: string, ...args: (string | number)[]): Promise<string | null>;
  xgroup(
    subcommand: "CREATE",
    key: string,
    group: string,
    id: "$",
    mkstream: "MKSTREAM",
  ): Promise<unknown>;
  xreadgroup(
    groupToken: "GROUP",
    group: string,
    consumer: string,
    countToken: "COUNT",
    count: number,
    blockToken: "BLOCK",
    block: number,
    streamsToken: "STREAMS",
    stream: string,
    cursor: string,
  ): Promise<[key: string, entries: [id: string, fields: string[] | null][]][] | null>;
  xreadgroup(
    groupToken: "GROUP",
    group: string,
    consumer: string,
    countToken: "COUNT",
    count: number,
    streamsToken: "STREAMS",
    stream: string,
    cursor: string,
  ): Promise<[key: string, entries: [id: string, fields: string[] | null][]][] | null>;
  xack(key: string, group: string, ...ids: string[]): Promise<number>;
}

/**
 * Thrown by {@link BrokerRedisClientLike.xgroup} when the group already exists (`BUSYGROUP`), which
 * {@link BrokerConsumer.start} treats as success rather than an error.
 */
export function isBusyGroupError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith("BUSYGROUP");
}

/**
 * Converts the flat `field value field value ...` array {@link BrokerRedisClientLike.xreadgroup} returns for a
 * stream entry into a record.
 */
export function fieldsToRecord(fields: string[] | null): Record<string, string> {
  const record: Record<string, string> = {};
  if (fields === null) return record;

  for (let index = 0; index < fields.length; index += 2) {
    record[fields[index]!] = fields[index + 1]!;
  }

  return record;
}
