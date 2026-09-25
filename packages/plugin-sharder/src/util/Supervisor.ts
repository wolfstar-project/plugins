/**
 * What else restarts when a shard crashes, after Erlang/OTP's supervisor strategies.
 *
 * - `one-for-one`: only the crashed shard.
 * - `one-for-all`: every shard.
 * - `rest-for-one`: the crashed shard, and every shard after it.
 */
export type SupervisorStrategy = "one-for-one" | "one-for-all" | "rest-for-one";

/**
 * How a manager restarts crashing shards, after Erlang/OTP's supervisors: a shard crashing more than `intensity`
 * times within `period` is given up on.
 */
export interface SupervisorOptions {
  /**
   * How many crashes are tolerated, `-1` or `Infinity` for no limit.
   *
   * @default -1
   */
  intensity?: number;
  /**
   * The window the crashes are counted in, in milliseconds. `0` counts the crashes in a row instead, until the shard
   * is ready again.
   *
   * @default 0
   */
  period?: number;
  /**
   * @default "one-for-one"
   */
  strategy?: SupervisorStrategy;
}

/**
 * Counts the crashes of each shard against the supervisor's intensity.
 *
 * @internal
 */
export class Supervisor {
  public readonly intensity: number;
  public readonly period: number;
  public readonly strategy: SupervisorStrategy;
  readonly #crashes = new Map<number, number[]>();

  public constructor(options: SupervisorOptions = {}) {
    const { intensity = -1, period = 0, strategy = "one-for-one" } = options;
    if (intensity !== -1 && intensity !== Number.POSITIVE_INFINITY) {
      if (!Number.isSafeInteger(intensity) || intensity < 0) {
        throw new RangeError(
          "supervisor.intensity must be a non-negative integer, -1, or Infinity",
        );
      }
    }

    this.intensity = intensity === Number.POSITIVE_INFINITY ? -1 : intensity;
    this.period = period;
    this.strategy = strategy;
  }

  /**
   * Counts a crash. Returns how many crashes count, and whether the shard may be restarted.
   *
   * @param channelId The ID of the crashed shard.
   */
  public crash(channelId: number): { crashes: number; restart: boolean } {
    const now = Date.now();
    const crashes = (this.#crashes.get(channelId) ?? []).filter(
      (timestamp) => this.period === 0 || now - timestamp < this.period,
    );
    crashes.push(now);
    this.#crashes.set(channelId, crashes);
    return {
      crashes: crashes.length,
      restart: this.intensity === -1 || crashes.length <= this.intensity,
    };
  }

  /**
   * Forgets the crashes of a shard that is ready again, when they are counted in a row.
   *
   * @param channelId The ID of the shard.
   */
  public ready(channelId: number): void {
    if (this.period === 0) this.#crashes.delete(channelId);
  }
}
