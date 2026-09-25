import { setTimeout as sleep } from "node:timers/promises";

/**
 * Hands out the turns of gateway shards to identify, across every process: Discord allows one identify per
 * `max_concurrency` bucket (`shardId % max_concurrency`) every 5 seconds.
 *
 * @internal
 */
export class IdentifyQueue {
  readonly #delay: number;
  readonly #buckets = new Map<number, Promise<void>>();
  #concurrency: number;

  public constructor(concurrency: number, delay: number) {
    this.#concurrency = concurrency;
    this.#delay = delay;
  }

  public set concurrency(value: number) {
    this.#concurrency = Math.max(1, value);
  }

  public get concurrency(): number {
    return this.#concurrency;
  }

  /**
   * Resolves once the gateway shard may identify. Aborting it drops it from the queue.
   *
   * @param shardId The ID of the gateway shard.
   * @param signal Aborts the wait.
   */
  public wait(shardId: number, signal?: AbortSignal): Promise<void> {
    const bucket = shardId % this.#concurrency;
    const previous = this.#buckets.get(bucket) ?? Promise.resolve();

    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    // The next shard of the bucket waits for this turn to be over, granted or dropped, plus the delay if granted.
    this.#buckets.set(
      bucket,
      previous.then(() => released),
    );

    return new Promise((resolve, reject) => {
      const onAbort = () => {
        release();
        reject(signal!.reason);
      };
      signal?.addEventListener("abort", onAbort, { once: true });

      void previous.then(() => {
        signal?.removeEventListener("abort", onAbort);
        if (signal?.aborted) return;
        resolve();
        void sleep(this.#delay, undefined, { ref: false }).then(release);
      });
    });
  }
}
