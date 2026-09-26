/**
 * The options of the manager's pings.
 */
export interface ShardPingOptions {
  /**
   * How often the manager pings each ready shard, in milliseconds; `-1` or `Infinity` disables the pings.
   *
   * @default 45_000
   */
  interval?: number;
  /**
   * How long a ready shard may go without answering a ping, in milliseconds, before it is deemed unresponsive:
   * emitted as `shardUnresponsive`, or restarted when nothing listens to it.
   *
   * @default 60_000
   */
  timeout?: number;
  /**
   * Whether the next ping is sent `interval` after the last answer, rather than after the last ping.
   *
   * @default false
   */
  delaySinceReceived?: boolean;
}

/**
 * Pings a shard, measures its latency, and notices when it stops answering.
 */
export class ShardPing {
  /**
   * When the last ping was sent, `-1` before the first one.
   */
  public lastSentTimestamp = -1;

  /**
   * When the last answer came, `-1` before the first one.
   */
  public lastReceivedTimestamp = -1;

  /**
   * The round trip of the last ping, in milliseconds; `-1` before the first answer.
   */
  public latency = -1;

  public readonly interval: number;
  public readonly timeout: number;
  public readonly delaySinceReceived: boolean;

  readonly #send: (sentAt: number) => Promise<void>;
  readonly #onTimeout: () => void;
  #timer: NodeJS.Timeout | null = null;
  #watchdog: NodeJS.Timeout | null = null;

  /**
   * @internal
   */
  public constructor(
    options: ShardPingOptions,
    send: (sentAt: number) => Promise<void>,
    onTimeout: () => void,
  ) {
    this.interval = options.interval ?? 45_000;
    this.timeout = options.timeout ?? 60_000;
    this.delaySinceReceived = options.delaySinceReceived ?? false;
    this.#send = send;
    this.#onTimeout = onTimeout;
  }

  /**
   * Whether the pings are running.
   */
  public get running(): boolean {
    return this.#watchdog !== null;
  }

  /**
   * Whether the last ping was answered.
   */
  public get hasReceivedResponse(): boolean {
    return this.lastReceivedTimestamp >= this.lastSentTimestamp;
  }

  public get lastSentAt(): Date | null {
    return this.lastSentTimestamp === -1 ? null : new Date(this.lastSentTimestamp);
  }

  public get lastReceivedAt(): Date | null {
    return this.lastReceivedTimestamp === -1 ? null : new Date(this.lastReceivedTimestamp);
  }

  /**
   * When the next ping is due, or `null` when the pings are not running.
   */
  public get nextPingTimestamp(): number | null {
    if (!this.running || !this.enabled) return null;
    const from = this.delaySinceReceived ? this.lastReceivedTimestamp : this.lastSentTimestamp;
    return (from === -1 ? Date.now() : from) + this.interval;
  }

  /**
   * @internal
   */
  public start(): void {
    if (this.running || !this.enabled) return;

    this.#watchdog = setTimeout(() => {
      this.stop();
      this.#onTimeout();
    }, this.timeout);
    this.#watchdog.unref();
    this.#schedule();
  }

  /**
   * @internal
   */
  public stop(): void {
    if (this.#timer) clearTimeout(this.#timer);
    if (this.#watchdog) clearTimeout(this.#watchdog);
    this.#timer = null;
    this.#watchdog = null;
  }

  /**
   * @internal
   */
  public receive(sentAt: number): void {
    this.lastReceivedTimestamp = Date.now();
    this.latency = this.lastReceivedTimestamp - sentAt;
    this.#watchdog?.refresh();
    if (this.delaySinceReceived && this.running) this.#schedule();
  }

  /**
   * Whether the manager pings at all.
   */
  public get enabled(): boolean {
    return this.interval !== -1 && this.interval !== Number.POSITIVE_INFINITY;
  }

  #schedule(): void {
    if (!this.enabled) return;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.#timer = null;
      this.lastSentTimestamp = Date.now();
      void this.#send(this.lastSentTimestamp).catch(() => undefined);
      if (!this.delaySinceReceived) this.#schedule();
    }, this.interval);
    this.#timer.unref();
  }
}
