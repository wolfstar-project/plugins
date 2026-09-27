import type { BrokerRedisClientLike } from "../../src/lib/redis.js";

interface StreamEntry {
  id: string;
  fields: string[];
}

interface Group {
  lastDeliveredId: string;
  /** Entry ID -> the consumer it is currently pending for. */
  pending: Map<string, string>;
}

interface Stream {
  entries: StreamEntry[];
  groups: Map<string, Group>;
}

/**
 * A minimal in-memory Redis Streams server, enough to exercise consumer-group semantics: `XGROUP CREATE` throws a
 * `BUSYGROUP` error on a pre-existing group, `XREADGROUP 0` returns a consumer's own pending entries (its PEL)
 * without claiming new ones, `XREADGROUP >` claims new entries past the group's last-delivered ID, and `XACK`
 * removes an entry from the PEL.
 */
export class FakeStreamRedis implements BrokerRedisClientLike {
  private readonly streams = new Map<string, Stream>();
  private nextId = 1;

  public async xadd(key: string, ...args: (string | number)[]): Promise<string> {
    const stream = this.streamOf(key);
    let index = 0;
    let maxLength: number | undefined;

    if (args[index] === "MAXLEN") {
      // args: "MAXLEN" "~" <n> ...
      maxLength = Number(args[index + 2]);
      index += 3;
    }

    // args[index] is the ID, always "*" (auto-generated) for this fixture.
    index += 1;
    const fields = args.slice(index).map(String);

    const id = `${this.nextId++}-0`;
    stream.entries.push({ id, fields });
    if (maxLength !== undefined && stream.entries.length > maxLength) {
      stream.entries.splice(0, stream.entries.length - maxLength);
    }

    return id;
  }

  public async xgroup(
    _subcommand: "CREATE",
    key: string,
    group: string,
    _id: "$",
    _mkstream: "MKSTREAM",
  ): Promise<unknown> {
    const stream = this.streamOf(key);
    if (stream.groups.has(group)) {
      throw new Error(`BUSYGROUP Consumer Group name already exists`);
    }

    const lastEntry = stream.entries.at(-1);
    stream.groups.set(group, { lastDeliveredId: lastEntry?.id ?? "0-0", pending: new Map() });
    return "OK";
  }

  public async xreadgroup(
    ...args: readonly unknown[]
  ): Promise<[key: string, entries: [id: string, fields: string[] | null][]][] | null> {
    const [, group, consumer, , count] = args as [string, string, string, string, number];
    const streamsIndex = args.indexOf("STREAMS");
    const [key, cursor] = args.slice(streamsIndex + 1) as [string, string];
    const blockIndex = args.indexOf("BLOCK");
    const blockMs = blockIndex === -1 ? undefined : Number(args[blockIndex + 1]);

    const stream = this.streamOf(key);
    const groupState = stream.groups.get(group);
    if (!groupState)
      throw new Error(`NOGROUP No such consumer group '${group}' for key name '${key}'`);

    const entries =
      cursor === "0"
        ? this.readPending(stream, groupState, consumer)
        : this.readNew(stream, groupState, consumer, count);

    // Mimics real BLOCK latency (capped, so idle tests don't wait the full configured duration) rather than
    // resolving instantly, which would otherwise turn the consumer's read loop into a CPU-spinning busy loop.
    if (entries.length === 0 && blockMs !== undefined) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(blockMs, 20)));
    }

    return entries.length === 0 ? null : [[key, entries.map((entry) => [entry.id, entry.fields])]];
  }

  public async xack(key: string, group: string, ...ids: string[]): Promise<number> {
    const groupState = this.streamOf(key).groups.get(group);
    if (!groupState) return 0;

    let acked = 0;
    for (const id of ids) {
      if (groupState.pending.delete(id)) acked++;
    }
    return acked;
  }

  private streamOf(key: string): Stream {
    let stream = this.streams.get(key);
    if (!stream) this.streams.set(key, (stream = { entries: [], groups: new Map() }));
    return stream;
  }

  private readPending(stream: Stream, group: Group, consumer: string): StreamEntry[] {
    const ids = [...group.pending.entries()]
      .filter(([, owner]) => owner === consumer)
      .map(([id]) => id);
    return stream.entries.filter((entry) => ids.includes(entry.id));
  }

  private readNew(stream: Stream, group: Group, consumer: string, count: number): StreamEntry[] {
    const entries = stream.entries
      .filter((entry) => compareIds(entry.id, group.lastDeliveredId) > 0)
      .slice(0, count);

    for (const entry of entries) {
      group.pending.set(entry.id, consumer);
      group.lastDeliveredId = entry.id;
    }

    return entries;
  }
}

function compareIds(a: string, b: string): number {
  const [aMillis, aSeq] = a.split("-").map(Number);
  const [bMillis, bSeq] = b.split("-").map(Number);
  return aMillis === bMillis ? aSeq! - bSeq! : aMillis! - bMillis!;
}
