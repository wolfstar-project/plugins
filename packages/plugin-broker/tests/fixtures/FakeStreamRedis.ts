import type { BrokerRedisClientLike, StreamEntry } from "../../src/lib/redis.js";

interface Entry {
  id: string;
  fields: string[];
}

interface PendingEntry {
  consumer: string;
  deliveries: number;
  deliveredAt: number;
}

interface Group {
  lastDeliveredId: string;
  /** Entry ID -> its pending state (PEL). */
  pending: Map<string, PendingEntry>;
}

interface Stream {
  entries: Entry[];
  groups: Map<string, Group>;
}

/**
 * A minimal in-memory Redis Streams server, enough to exercise consumer-group semantics: `XGROUP CREATE` throws a
 * `BUSYGROUP` error on a pre-existing group, `XREADGROUP <id>` returns a consumer's own pending entries after `<id>`
 * (its PEL, an empty list once exhausted) without claiming new ones, `XREADGROUP >` claims new entries past the
 * group's last-delivered ID, `XAUTOCLAIM` transfers idle pending entries, `XPENDING` reports delivery counts, and
 * `XACK` removes an entry from the PEL. Like Redis, every delivery of a pending entry increments its counter, and an
 * entry trimmed while pending is returned with `null` fields.
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
  ): Promise<[key: string, entries: StreamEntry[]][] | null> {
    const [, group, consumer, , count] = args as [string, string, string, string, number];
    const streamsIndex = args.indexOf("STREAMS");
    const [key, cursor] = args.slice(streamsIndex + 1) as [string, string];
    const blockIndex = args.indexOf("BLOCK");
    const blockMs = blockIndex === -1 ? undefined : Number(args[blockIndex + 1]);

    const stream = this.streamOf(key);
    const groupState = this.groupOf(stream, key, group);

    // Reading a consumer's history never blocks, and resolves to the stream with no entries once exhausted.
    if (cursor !== ">")
      return [[key, this.readPending(stream, groupState, consumer, cursor, count)]];

    const entries = this.readNew(stream, groupState, consumer, count);

    // Mimics real BLOCK latency (capped, so idle tests don't wait the full configured duration) rather than
    // resolving instantly, which would otherwise turn the consumer's read loop into a CPU-spinning busy loop.
    if (entries.length === 0 && blockMs !== undefined) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(blockMs, 20)));
    }

    return entries.length === 0 ? null : [[key, entries]];
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

  public async xautoclaim(
    key: string,
    group: string,
    consumer: string,
    minIdleTime: number,
    start: string,
    _countToken: "COUNT",
    count: number,
  ): Promise<unknown[]> {
    const stream = this.streamOf(key);
    const groupState = this.groupOf(stream, key, group);
    const now = Date.now();
    const ids = this.sortedPending(groupState).filter((id) => compareIds(id, start) >= 0);

    const claimed: StreamEntry[] = [];
    const deleted: string[] = [];
    let next = "0-0";
    for (const [index, id] of ids.entries()) {
      if (claimed.length + deleted.length === count) {
        next = ids[index]!;
        break;
      }

      const state = groupState.pending.get(id)!;
      if (now - state.deliveredAt < minIdleTime) continue;

      const entry = stream.entries.find((candidate) => candidate.id === id);
      if (!entry) {
        // Redis 7 drops deleted entries from the PEL and reports them separately.
        groupState.pending.delete(id);
        deleted.push(id);
        continue;
      }

      groupState.pending.set(id, { consumer, deliveries: state.deliveries + 1, deliveredAt: now });
      claimed.push([id, entry.fields]);
    }

    return [next, claimed, deleted];
  }

  public async xpending(
    key: string,
    group: string,
    start: string,
    end: string,
    count: number,
  ): Promise<unknown[]> {
    const groupState = this.groupOf(this.streamOf(key), key, group);
    const now = Date.now();

    return this.sortedPending(groupState)
      .filter((id) => compareIds(id, start) >= 0 && compareIds(id, end) <= 0)
      .slice(0, count)
      .map((id) => {
        const state = groupState.pending.get(id)!;
        return [id, state.consumer, now - state.deliveredAt, state.deliveries];
      });
  }

  /**
   * Every entry currently in a stream, for assertions.
   */
  public entriesOf(key: string): readonly Entry[] {
    return this.streams.get(key)?.entries ?? [];
  }

  /**
   * Ages every pending entry of a group by `ms`, so tests need not wait out `claimIdle`.
   */
  public age(key: string, group: string, ms: number): void {
    const groupState = this.groupOf(this.streamOf(key), key, group);
    for (const state of groupState.pending.values()) state.deliveredAt -= ms;
  }

  private streamOf(key: string): Stream {
    let stream = this.streams.get(key);
    if (!stream) this.streams.set(key, (stream = { entries: [], groups: new Map() }));
    return stream;
  }

  private groupOf(stream: Stream, key: string, group: string): Group {
    const groupState = stream.groups.get(group);
    if (!groupState)
      throw new Error(`NOGROUP No such consumer group '${group}' for key name '${key}'`);
    return groupState;
  }

  private sortedPending(group: Group): string[] {
    return [...group.pending.keys()].toSorted(compareIds);
  }

  private readPending(
    stream: Stream,
    group: Group,
    consumer: string,
    cursor: string,
    count: number,
  ): StreamEntry[] {
    const now = Date.now();
    return this.sortedPending(group)
      .filter((id) => group.pending.get(id)!.consumer === consumer && compareIds(id, cursor) > 0)
      .slice(0, count)
      .map((id) => {
        const state = group.pending.get(id)!;
        state.deliveries++;
        state.deliveredAt = now;
        return [id, stream.entries.find((entry) => entry.id === id)?.fields ?? null];
      });
  }

  private readNew(stream: Stream, group: Group, consumer: string, count: number): StreamEntry[] {
    const entries = stream.entries
      .filter((entry) => compareIds(entry.id, group.lastDeliveredId) > 0)
      .slice(0, count);

    const now = Date.now();
    for (const entry of entries) {
      group.pending.set(entry.id, { consumer, deliveries: 1, deliveredAt: now });
      group.lastDeliveredId = entry.id;
    }

    return entries.map((entry) => [entry.id, entry.fields]);
  }
}

function compareIds(a: string, b: string): number {
  if (a === b) return 0;
  if (a === "-" || b === "+") return -1;
  if (a === "+" || b === "-") return 1;

  const [aMillis, aSeq] = a.split("-").map(Number);
  const [bMillis, bSeq] = b.split("-").map(Number);
  return aMillis === bMillis ? aSeq! - bSeq! : aMillis! - bMillis!;
}
