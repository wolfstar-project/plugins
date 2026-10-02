import type { Listener } from "@wolfstar/http-framework";
import { jsonCodec, type CacheCodec } from "@wolfstar/plugin-cache";
import {
  fieldsToRecord,
  isBusyGroupError,
  type BrokerRedisClientLike,
  type StreamEntry,
} from "./lib/redis.js";
import type { BrokerMessage } from "./lib/types.js";

export interface BrokerConsumerOptions {
  /**
   * The Redis client to use, e.g. an [`ioredis`](https://github.com/redis/ioredis) instance.
   */
  redis: BrokerRedisClientLike;
  /**
   * The Redis key of the stream to read from.
   */
  stream: string;
  /**
   * The consumer group. Created on {@link BrokerConsumer.start} if it does not exist yet.
   */
  group: string;
  /**
   * A name stable across restarts, so a crashed consumer's pending entries are reclaimed by its own restart rather
   * than left for another consumer to claim, see {@link BrokerConsumerOptions.claimIdle}.
   */
  consumer: string;
  /**
   * The maximum number of entries read per `XREADGROUP` (or claimed per `XAUTOCLAIM`) call.
   *
   * @default 10
   */
  batchSize?: number;
  /**
   * How long, in milliseconds, a read blocks for new entries before returning empty.
   *
   * @default 5000
   */
  block?: number;
  /**
   * The codec used to decode payloads. Must match the producer's.
   *
   * @default jsonCodec()
   */
  codec?: CacheCodec;
  /**
   * Claims (`XAUTOCLAIM`) the entries any consumer of the group left pending for longer than this many milliseconds,
   * e.g. one that crashed and never restarted under the same name, and handles them as redeliveries. Checked at most
   * once per this interval. Left unset, only this consumer's own pending entries are redelivered, when it starts.
   *
   * @remarks
   * This consumer's own entries are claimed too, so an entry whose listener threw is retried in-process once it has
   * been idle for this long, rather than only on the next start.
   *
   * An entry's idle time runs from its last delivery, not from its last sign of life: an entry whose listeners are
   * still running after this long can be claimed and handled again, concurrently, by another consumer. Set it well
   * above the slowest listener's run time, not just above how fast a crash should be noticed.
   */
  claimIdle?: number;
  /**
   * The number of times an entry can be delivered: past it, the entry is moved to
   * {@link BrokerConsumerOptions.deadLetterStream} instead of being handed to the listeners again. Left unset, a
   * failing entry is retried forever.
   *
   * @remarks
   * Deliveries are counted by Redis (the `XPENDING` delivery counter), so they add up across consumers and restarts.
   */
  maxDeliveries?: number;
  /**
   * The Redis key of the stream the entries exceeding {@link BrokerConsumerOptions.maxDeliveries} are moved to. Each
   * dead-lettered entry keeps its `event` and `payload` fields, plus the original `id`, `stream`, `group`,
   * `consumer`, and `deliveries`.
   *
   * @default `${stream}:dead`
   */
  deadLetterStream?: string;
  /**
   * The process signals that stop the consumer (see {@link BrokerConsumer.stop}) while it runs. Once it has stopped,
   * the signal is raised again if nothing else listens to it, so the process still terminates as it would have
   * without this option; otherwise, exiting is left to those other listeners.
   *
   * @example
   * ```typescript
   * shutdownSignals: ['SIGTERM', 'SIGINT']
   * ```
   */
  shutdownSignals?: readonly NodeJS.Signals[];
}

type EmitterListener = (...args: readonly unknown[]) => unknown;

/**
 * Reads a Redis stream through a consumer group, dispatching each entry to the {@link BrokerListener} pieces
 * registered for its event, and only acknowledging it once every one of them has resolved.
 *
 * @remarks
 * Implements the framework's {@link Listener.Emitter} contract itself, so `BrokerListener` pieces can bind to a
 * `BrokerConsumer` instance the same way `EventGatewayListener` pieces bind to a `GatewayClient`.
 *
 * A listener that throws leaves its entry pending: it is redelivered the next time a consumer of the same
 * {@link BrokerConsumerOptions.consumer name} starts, or claimed once idle for {@link BrokerConsumerOptions.claimIdle},
 * until it exceeds {@link BrokerConsumerOptions.maxDeliveries} and is moved to the dead-letter stream. Entries are
 * handled one at a time, so `stop()` only has to await the current one before returning.
 */
export class BrokerConsumer implements Listener.Emitter {
  readonly #redis: BrokerRedisClientLike;
  readonly #stream: string;
  readonly #group: string;
  readonly #consumer: string;
  readonly #batchSize: number;
  readonly #block: number;
  readonly #codec: CacheCodec;
  readonly #claimIdle: number | undefined;
  readonly #maxDeliveries: number | undefined;
  readonly #deadLetterStream: string;
  readonly #shutdownSignals: readonly NodeJS.Signals[];

  readonly #listeners = new Map<string, Set<EmitterListener>>();
  readonly #signalHandlers = new Map<NodeJS.Signals, () => void>();
  #pending: unknown[] = [];
  #running = false;
  #loop: Promise<void> | null = null;

  public constructor(options: BrokerConsumerOptions) {
    const { maxDeliveries, claimIdle } = options;
    if (maxDeliveries !== undefined && !(Number.isInteger(maxDeliveries) && maxDeliveries >= 1)) {
      throw new RangeError(`maxDeliveries must be a positive integer, received ${maxDeliveries}`);
    }

    if (claimIdle !== undefined && !(claimIdle > 0)) {
      throw new RangeError(`claimIdle must be a positive number, received ${claimIdle}`);
    }

    this.#redis = options.redis;
    this.#stream = options.stream;
    this.#group = options.group;
    this.#consumer = options.consumer;
    this.#batchSize = options.batchSize ?? 10;
    this.#block = options.block ?? 5_000;
    this.#codec = options.codec ?? jsonCodec();
    this.#claimIdle = claimIdle;
    this.#maxDeliveries = maxDeliveries;
    this.#deadLetterStream = options.deadLetterStream ?? `${options.stream}:dead`;
    this.#shutdownSignals = options.shutdownSignals ?? [];
  }

  public on(eventName: string, listener: EmitterListener): this {
    let listeners = this.#listeners.get(eventName);
    if (!listeners) this.#listeners.set(eventName, (listeners = new Set()));
    listeners.add(listener);
    return this;
  }

  public once(eventName: string, listener: EmitterListener): this {
    const wrapped: EmitterListener = (...args) => {
      this.off(eventName, wrapped);
      return listener(...args);
    };
    return this.on(eventName, wrapped);
  }

  public off(eventName: string, listener: EmitterListener): this {
    this.#listeners.get(eventName)?.delete(listener);
    return this;
  }

  public setMaxListeners(_n: number): this {
    return this;
  }

  public getMaxListeners(): number {
    return Number.POSITIVE_INFINITY;
  }

  public emit(eventName: string, ...args: readonly unknown[]): boolean {
    const listeners = this.#listeners.get(eventName);
    if (!listeners || listeners.size === 0) return false;

    for (const listener of listeners) {
      try {
        // A synchronously throwing listener is normalized to a rejected promise, so `Promise.all(this.#pending)`
        // in `#handle` catches it the same way it would an asynchronous rejection.
        this.#pending.push(listener(...args));
      } catch (error) {
        this.#pending.push(Promise.reject(error));
      }
    }

    return true;
  }

  /**
   * Ensures the consumer group exists, then starts reading: first this consumer's own pending entries (redelivery
   * after a crash under the same name), then new ones, claiming idle entries along the way if
   * {@link BrokerConsumerOptions.claimIdle} is set, until {@link BrokerConsumer.stop}.
   */
  public async start(): Promise<void> {
    if (this.#running) return;

    this.#running = true;
    try {
      await this.#redis.xgroup("CREATE", this.#stream, this.#group, "$", "MKSTREAM");
    } catch (error) {
      if (!isBusyGroupError(error)) {
        this.#running = false;
        throw error;
      }
    }

    for (const signal of this.#shutdownSignals) {
      const handler = () => {
        void this.stop().finally(() => {
          // Nothing else handles the signal: raise it again for its default behavior, terminating the process.
          if (process.listenerCount(signal) === 0) process.kill(process.pid, signal);
        });
      };
      this.#signalHandlers.set(signal, handler);
      process.once(signal, handler);
    }

    this.#loop = this.#run();
  }

  /**
   * Stops reading and awaits the in-flight entry, so it does not return until the current entry's listeners have
   * settled. Any entry left pending is redelivered the next time a consumer of the same name starts, or claimed by
   * another one once idle for {@link BrokerConsumerOptions.claimIdle}.
   */
  public async stop(): Promise<void> {
    this.#running = false;
    for (const [signal, handler] of this.#signalHandlers) process.off(signal, handler);
    this.#signalHandlers.clear();

    await this.#loop;
    this.#loop = null;
  }

  async #run(): Promise<void> {
    // This consumer's own pending entries. A history read only returns the entries after the given ID, so the
    // cursor advances past every one handled, including those left pending again, instead of re-reading them.
    let cursor = "0-0";
    while (this.#running) {
      const entries = await this.#read(cursor);
      if (entries.length === 0) break;

      for (const entry of entries) {
        if (!this.#running) return;
        await this.#handle(entry, true);
      }

      cursor = entries.at(-1)![0];
    }

    let nextClaimAt = 0;
    while (this.#running) {
      if (this.#claimIdle !== undefined && Date.now() >= nextClaimAt) {
        await this.#claim(this.#claimIdle);
        nextClaimAt = Date.now() + this.#claimIdle;
      }

      for (const entry of await this.#read(">")) {
        if (!this.#running) return;
        await this.#handle(entry, false);
      }
    }
  }

  async #read(cursor: string): Promise<StreamEntry[]> {
    const result =
      cursor === ">"
        ? await this.#redis.xreadgroup(
            "GROUP",
            this.#group,
            this.#consumer,
            "COUNT",
            this.#batchSize,
            "BLOCK",
            this.#block,
            "STREAMS",
            this.#stream,
            cursor,
          )
        : await this.#redis.xreadgroup(
            "GROUP",
            this.#group,
            this.#consumer,
            "COUNT",
            this.#batchSize,
            "STREAMS",
            this.#stream,
            cursor,
          );

    // An exhausted history read resolves to the stream with no entries, a timed out blocking read to `null`.
    return result?.flatMap(([, entries]) => entries) ?? [];
  }

  async #claim(minIdleTime: number): Promise<void> {
    let start = "0-0";
    do {
      const [next, entries] = (await this.#redis.xautoclaim(
        this.#stream,
        this.#group,
        this.#consumer,
        minIdleTime,
        start,
        "COUNT",
        this.#batchSize,
      )) as [next: string, entries: StreamEntry[]];

      for (const entry of entries) {
        if (!this.#running) return;
        await this.#handle(entry, true);
      }

      start = next;
    } while (this.#running && start !== "0-0");
  }

  async #handle([id, fields]: StreamEntry, redelivered: boolean): Promise<void> {
    // Deleted (e.g. trimmed by `MAXLEN`) while pending: there is nothing left to deliver.
    if (fields === null) {
      await this.#redis.xack(this.#stream, this.#group, id);
      return;
    }

    if (redelivered && this.#maxDeliveries !== undefined) {
      const deliveries = await this.#deliveries(id);
      if (deliveries > this.#maxDeliveries) {
        await this.#deadLetter(id, fields, deliveries);
        return;
      }
    }

    const record = fieldsToRecord(fields);
    const shard = record.shard === undefined ? Number.NaN : Number(record.shard);
    const sequence = record.sequence === undefined ? Number.NaN : Number(record.sequence);

    let payload: unknown;
    let state: unknown;
    try {
      payload = this.#codec.decode(Buffer.from(record.payload ?? "", "base64"));
      if (record.state !== undefined) {
        state = this.#codec.decode(Buffer.from(record.state, "base64"));
      }
    } catch {
      // Left pending like a throwing listener's entry, so it ends up dead-lettered rather than silently dropped.
      return;
    }

    const message: BrokerMessage = {
      id,
      event: record.event ?? "",
      ...(record.state === undefined ? {} : { state }),
      ...(Number.isInteger(shard) ? { shard } : {}),
      ...(Number.isInteger(sequence) ? { sequence } : {}),
    };

    this.#pending = [];
    const dispatched = this.emit(message.event, payload, message);

    if (dispatched) {
      try {
        await Promise.all(this.#pending);
      } catch {
        // Left pending: redelivered the next time a consumer of this name starts, or claimed once idle.
        return;
      }
    }

    await this.#redis.xack(this.#stream, this.#group, id);
  }

  async #deliveries(id: string): Promise<number> {
    const [entry] = (await this.#redis.xpending(this.#stream, this.#group, id, id, 1)) as [
      id: string,
      consumer: string,
      idleTime: number,
      deliveries: number,
    ][];
    return entry ? Number(entry[3]) : 0;
  }

  async #deadLetter(id: string, fields: string[], deliveries: number): Promise<void> {
    // Added before acknowledging: a crash in between duplicates the entry in the dead-letter stream, never loses it.
    await this.#redis.xadd(
      this.#deadLetterStream,
      "*",
      ...fields,
      "id",
      id,
      "stream",
      this.#stream,
      "group",
      this.#group,
      "consumer",
      this.#consumer,
      "deliveries",
      deliveries,
    );
    await this.#redis.xack(this.#stream, this.#group, id);
  }
}
