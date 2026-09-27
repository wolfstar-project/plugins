import type { Listener } from "@wolfstar/http-framework";
import { jsonCodec, type CacheCodec } from "@wolfstar/plugin-cache";
import { fieldsToRecord, isBusyGroupError, type BrokerRedisClientLike } from "./lib/redis.js";
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
   * than left for a manual `XAUTOCLAIM`.
   */
  consumer: string;
  /**
   * The maximum number of entries read per `XREADGROUP` call.
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
 * {@link BrokerConsumerOptions.consumer name} starts. Entries are handled one at a time, so `stop()` only has to
 * await the current one before returning.
 */
export class BrokerConsumer implements Listener.Emitter {
  readonly #redis: BrokerRedisClientLike;
  readonly #stream: string;
  readonly #group: string;
  readonly #consumer: string;
  readonly #batchSize: number;
  readonly #block: number;
  readonly #codec: CacheCodec;

  readonly #listeners = new Map<string, Set<EmitterListener>>();
  #pending: unknown[] = [];
  #running = false;
  #loop: Promise<void> | null = null;

  public constructor(options: BrokerConsumerOptions) {
    this.#redis = options.redis;
    this.#stream = options.stream;
    this.#group = options.group;
    this.#consumer = options.consumer;
    this.#batchSize = options.batchSize ?? 10;
    this.#block = options.block ?? 5_000;
    this.#codec = options.codec ?? jsonCodec();
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
   * after a crash under the same name), then new ones, until {@link BrokerConsumer.stop}.
   */
  public async start(): Promise<void> {
    if (this.#running) return;

    this.#running = true;
    try {
      await this.#redis.xgroup("CREATE", this.#stream, this.#group, "$", "MKSTREAM");
    } catch (error) {
      if (!isBusyGroupError(error)) throw error;
    }

    this.#loop = this.#run();
  }

  /**
   * Stops reading and awaits the in-flight batch, so it does not return until the current entry's listeners have
   * settled. Any entry left pending is redelivered the next time a consumer of the same name starts.
   */
  public async stop(): Promise<void> {
    this.#running = false;
    await this.#loop;
    this.#loop = null;
  }

  async #run(): Promise<void> {
    while (this.#running && (await this.#drain("0"))) {
      // Keep draining this consumer's own pending entries before moving on to new ones.
    }

    while (this.#running) {
      await this.#drain(">");
    }
  }

  async #drain(cursor: string): Promise<boolean> {
    const result =
      cursor === "0"
        ? await this.#redis.xreadgroup(
            "GROUP",
            this.#group,
            this.#consumer,
            "COUNT",
            this.#batchSize,
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
            "BLOCK",
            this.#block,
            "STREAMS",
            this.#stream,
            cursor,
          );

    if (result === null) return false;

    for (const [, entries] of result) {
      for (const [id, fields] of entries) await this.#handle(id, fields);
    }

    return true;
  }

  async #handle(id: string, fields: string[] | null): Promise<void> {
    const record = fieldsToRecord(fields);
    const payload = this.#codec.decode(Buffer.from(record.payload ?? "", "base64"));
    const message: BrokerMessage = { id, event: record.event ?? "" };

    this.#pending = [];
    const dispatched = this.emit(message.event, payload, message);

    if (dispatched) {
      try {
        await Promise.all(this.#pending);
      } catch {
        // Left pending: redelivered the next time a consumer of this name starts.
        return;
      }
    }

    await this.#redis.xack(this.#stream, this.#group, id);
  }
}
