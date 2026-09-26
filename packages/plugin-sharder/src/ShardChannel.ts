import type { Result } from "@sapphire/result";
import { EventEmitter } from "node:events";
import type { ShardManager } from "./ShardManager.js";
import { ShardPing } from "./ShardPing.js";
import { Op, ShardStatus, type Packet, type SystemCall } from "./messages/protocol.js";
import type { ShardContext, ShardTransport } from "./strategies/ChannelStrategy.js";
import { ShardSpawnError, ShardUnavailableError, type ShardError } from "./util/errors.js";
import {
  IncomingRequests,
  OutgoingRequests,
  toResult,
  type RequestOptions,
} from "./util/requests.js";

/**
 * The events of a {@link ShardChannel}. The manager emits them too, prefixed with `shard` and with the channel first.
 */
export interface ShardChannelEvents {
  /**
   * The shard was spawned (`shardCreate` on the manager).
   */
  spawn: [];
  status: [status: ShardStatus];
  ready: [];
  disconnect: [];
  reconnecting: [];
  /**
   * The shard answered a ping; `latency` is the round trip, in milliseconds.
   */
  ping: [latency: number];
  unresponsive: [];
  /**
   * The shard takes longer than expected to be ready, see `spawn.readyHint`.
   */
  slowStart: [elapsed: number, estimate: number];
  exit: [code: number | null];
  destroy: [];
  error: [error: unknown];
  message: [body: any];
}

interface Instance {
  transport: ShardTransport | null;
  status: ShardStatus;
  startedAt: number;
  everReady: boolean;
  exited: boolean;
  exit: Promise<number | null>;
  resolveExit(code: number | null): void;
  ready: Promise<void>;
  resolveReady(): void;
  /**
   * Stopped on purpose: its exit is not a crash.
   */
  stopping: boolean;
  /**
   * Awaited by whoever spawned it, who handles its failure.
   */
  awaited: boolean;
  incoming: IncomingRequests;
  slowStart: NodeJS.Timeout | null;
}

interface ReadyWaiter {
  resolve(): void;
  reject(error: unknown): void;
}

/**
 * The options of a restart.
 */
export interface ShardRestartOptions {
  /**
   * Whether to spawn the new shard before closing the old one, which only closes once the new one is ready: close to
   * no downtime, at the cost of both running for a moment.
   *
   * @default false
   */
  rolling?: boolean;
  /**
   * How long to wait for the old shard to exit, and for the new one to be ready, in milliseconds.
   */
  timeout?: number;
}

/**
 * The manager's channel to one shard: a process, cluster worker, worker thread, or remote process, connecting some
 * gateway shards.
 *
 * @remarks
 * Named after discord.js's sharder: a "shard" is the client a manager spawns, and the channel is how the manager
 * talks to it, whatever the channel strategy.
 */
export class ShardChannel extends EventEmitter<ShardChannelEvents> {
  /**
   * The ID of the channel, its index in {@link ShardManager.channels}.
   */
  public readonly id: number;

  /**
   * The IDs of the gateway shards the shard connects.
   */
  public readonly shards: readonly number[];

  /**
   * The total number of gateway shards the shard is told about.
   */
  public readonly shardCount: number;

  public readonly manager: ShardManager;

  /**
   * The pings of the shard.
   */
  public readonly ping: ShardPing;

  /**
   * The status of the running shard, `Idle` when none runs.
   */
  public status: ShardStatus = ShardStatus.Idle;

  #active: Instance | null = null;
  #replacement: Instance | null = null;
  #stopped = false;
  readonly #waiters = new Set<ReadyWaiter>();
  readonly #outgoing = new OutgoingRequests();

  /**
   * @internal
   */
  public constructor(
    manager: ShardManager,
    id: number,
    shards: readonly number[],
    shardCount: number,
  ) {
    super();
    this.manager = manager;
    this.id = id;
    this.shards = shards;
    this.shardCount = shardCount;
    this.ping = new ShardPing(
      manager.pingOptions,
      (sentAt) => this.#write(this.#active, { op: Op.Ping, sentAt }),
      () => this.#unresponsive(),
    );
  }

  /**
   * Whether the shard is running and signalled that it is ready.
   */
  public get ready(): boolean {
    return this.status === ShardStatus.Ready;
  }

  /**
   * Whether a shard is running: spawned, and not stopped yet.
   */
  public get running(): boolean {
    return this.#active !== null;
  }

  /**
   * Whether the channel was stopped for good: closed, exited, or given up on.
   */
  public get stopped(): boolean {
    return this.#stopped;
  }

  /**
   * The ID of the shard's process.
   */
  public get pid(): number | null {
    return this.#active?.transport?.pid ?? null;
  }

  /**
   * The ID of the shard's worker thread, for {@link WorkerStrategy}.
   */
  public get threadId(): number | null {
    return this.#active?.transport?.threadId ?? null;
  }

  /**
   * The host running the shard, for strategies spawning shards elsewhere.
   */
  public get host(): string | null {
    return this.#active?.transport?.host ?? null;
  }

  /**
   * When the running shard was spawned.
   */
  public get startedTimestamp(): number | null {
    return this.#active?.startedAt ?? null;
  }

  /**
   * Spawns the shard, and waits for it to signal that it is ready.
   *
   * @param timeout How long to wait for it, in milliseconds. Past it, the shard is killed and the promise rejects.
   */
  public async start(timeout = this.manager.spawnTimeout): Promise<void> {
    if (this.#active) throw new Error(`Shard ${this.id} is already running`);

    this.#stopped = false;
    const instance = this.#spawn();
    this.#active = instance;
    this.#setStatus(ShardStatus.Starting);
    await this.#awaitReady(instance, timeout);
  }

  /**
   * Stops the shard for good. It is first asked to close, which runs its close handler, and is killed if it did not
   * exit within the timeout.
   *
   * @param timeout How long to wait for the shard to exit by itself, in milliseconds.
   */
  public async close(timeout = this.manager.requestTimeout): Promise<void> {
    this.#stopped = true;
    this.#rejectWaiters(new ShardUnavailableError(this.id, "it was closed"));
    const instances = [this.#replacement, this.#active].filter((instance) => instance !== null);
    if (instances.length === 0) return;

    await Promise.all(instances.map((instance) => this.#stop(instance, timeout)));
    this.emit("destroy");
    this.manager.emit("shardDestroy", this);
  }

  /**
   * Restarts the shard through its manager, see {@link ShardManager.restart}.
   *
   * @param options Whether to restart it rolling, and the timeout.
   */
  public restart(options?: ShardRestartOptions): Promise<void> {
    return this.manager.restart(this.id, options);
  }

  /**
   * Waits for the shard to be ready.
   *
   * @param timeout How long to wait, in milliseconds.
   * @param signal Aborts the wait.
   * @throws A {@link ShardUnavailableError} when the shard is stopped for good, not ready in time, or expected to be
   * ready past the timeout (see `spawn.readyHint`).
   */
  public waitForReady(timeout = this.manager.requestTimeout, signal?: AbortSignal): Promise<void> {
    if (this.ready) return Promise.resolve();
    if (this.#stopped) {
      return Promise.reject(new ShardUnavailableError(this.id, "it is stopped"));
    }

    signal?.throwIfAborted();
    const remaining = this.#estimatedRemaining();
    if (remaining !== null && remaining > timeout) {
      return Promise.reject(
        new ShardUnavailableError(this.id, `it is expected to be ready in ${remaining}ms`),
      );
    }

    return new Promise((resolve, reject) => {
      const settle = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        this.#waiters.delete(waiter);
      };
      const waiter: ReadyWaiter = {
        resolve: () => {
          settle();
          resolve();
        },
        reject: (error) => {
          settle();
          reject(error);
        },
      };
      const onAbort = () => waiter.reject(signal!.reason);
      const timer = setTimeout(
        () => waiter.reject(new ShardUnavailableError(this.id, `not ready within ${timeout}ms`)),
        timeout,
      );
      signal?.addEventListener("abort", onAbort, { once: true });
      this.#waiters.add(waiter);
    });
  }

  /**
   * Sends a message to the shard, emitted as `message` by its {@link ShardClient}. Waits for the shard to be ready.
   *
   * @param body The message.
   * @param options How long to wait for the shard to be ready, and an abort signal.
   * @param from The shard the message comes from, `null` for the manager.
   */
  public async send(
    body: unknown,
    options: RequestOptions = {},
    from: number | null = null,
  ): Promise<void> {
    await this.waitForReady(options.timeout, options.signal);
    await this.#write(this.#active, { op: Op.Message, body, from });
  }

  /**
   * Sends a request to the shard, answered by its {@link ShardClient}'s request handler. Waits for the shard to be
   * ready.
   *
   * @param body The request.
   * @param options The timeout and abort signal of the request.
   * @param from The shard the request comes from, `null` for the manager.
   */
  public async request<Reply = unknown>(
    body: unknown,
    options: RequestOptions = {},
    from: number | null = null,
  ): Promise<Reply> {
    return this.#request(body, options, { from }) as Promise<Reply>;
  }

  /**
   * {@link ShardChannel.send}, resolving with a `Result` rather than rejecting.
   */
  public trySend(body: unknown, options?: RequestOptions): Promise<Result<void, ShardError>> {
    return toResult(() => this.send(body, options));
  }

  /**
   * {@link ShardChannel.request}, resolving with a `Result` rather than rejecting.
   */
  public tryRequest<Reply = unknown>(
    body: unknown,
    options?: RequestOptions,
  ): Promise<Result<Reply, ShardError>> {
    return toResult(() => this.request<Reply>(body, options));
  }

  /**
   * Asks the shard to start one of its gateway shards, through its shard handler.
   *
   * @param shardId The ID of the gateway shard.
   * @param options The timeout and abort signal of the request.
   */
  public async startShard(shardId: number, options?: RequestOptions): Promise<void> {
    await this.#system("startShard", shardId, options);
  }

  /**
   * Asks the shard to close one of its gateway shards, through its shard handler.
   *
   * @param shardId The ID of the gateway shard.
   * @param options The timeout and abort signal of the request.
   */
  public async closeShard(shardId: number, options?: RequestOptions): Promise<void> {
    await this.#system("closeShard", shardId, options);
  }

  /**
   * Restarts the shard, keeping the old one until the new one is ready.
   *
   * @internal
   */
  public async rollingRestart(timeout = this.manager.spawnTimeout): Promise<void> {
    if (!this.#active) {
      await this.start(timeout);
      return;
    }

    this.#stopped = false;
    const replacement = this.#spawn();
    this.#replacement = replacement;
    try {
      await this.#awaitReady(replacement, timeout);
    } finally {
      if (this.#replacement === replacement) this.#replacement = null;
    }

    const previous = this.#active;
    this.#active = replacement;
    this.ping.stop();
    this.status = ShardStatus.Starting;
    this.#setStatus(replacement.status);
    if (previous) await this.#stop(previous, timeout);
  }

  /**
   * Stops the channel for good without closing anything, when its shard exited or was given up on.
   *
   * @internal
   */
  public markStopped(reason: string): void {
    this.#stopped = true;
    this.#rejectWaiters(new ShardUnavailableError(this.id, reason));
  }

  async #request(
    body: unknown,
    options: RequestOptions,
    fields: { from?: number | null; partial?: boolean; system?: SystemCall },
  ): Promise<unknown> {
    const timeout = options.timeout ?? this.manager.requestTimeout;
    const started = Date.now();
    await this.waitForReady(timeout, options.signal);
    const active = this.#active;
    return this.#outgoing.request(
      (packet) => this.#write(active, packet),
      { body, ...fields },
      Math.max(timeout - (Date.now() - started), 1),
      options.signal,
      active,
    );
  }

  #system(call: SystemCall, body: unknown, options: RequestOptions = {}): Promise<unknown> {
    return this.#request(body, options, { system: call });
  }

  #spawn(): Instance {
    let resolveExit!: (code: number | null) => void;
    let resolveReady!: () => void;
    const instance: Instance = {
      transport: null,
      status: ShardStatus.Starting,
      startedAt: Date.now(),
      everReady: false,
      exited: false,
      exit: new Promise((resolve) => {
        resolveExit = resolve;
      }),
      resolveExit: (code) => resolveExit(code),
      ready: new Promise((resolve) => {
        resolveReady = resolve;
      }),
      resolveReady: () => resolveReady(),
      stopping: false,
      awaited: true,
      incoming: new IncomingRequests(),
      slowStart: null,
    };

    const context: ShardContext = {
      id: this.id,
      shards: this.shards,
      shardCount: this.shardCount,
      pingTimeout: this.ping.enabled ? this.ping.timeout + this.ping.interval : null,
      requestTimeout: this.manager.requestTimeout,
      messageHandler: this.manager.codec.handler.name,
      transformers: this.manager.codec.transformers.map((transformer) => transformer.name),
    };
    instance.transport = this.manager.strategy.spawn(
      context,
      {
        message: (data) => void this.#receive(instance, data),
        exit: (code) => this.#exited(instance, code),
        error: (error) => this.#failed(instance, error),
      },
      { env: this.manager.spawnEnv },
    );

    const estimate = this.manager.readyEstimate;
    if (estimate !== null) {
      instance.slowStart = setTimeout(
        () => {
          instance.slowStart = null;
          if (instance.everReady || instance.exited) return;
          const elapsed = Date.now() - instance.startedAt;
          this.emit("slowStart", elapsed, estimate);
          this.manager.emit("shardSlowStart", this, elapsed, estimate);
        },
        estimate * (1 + this.manager.readyHintMargin),
      );
      instance.slowStart.unref();
    }

    this.emit("spawn");
    this.manager.emit("shardCreate", this);
    return instance;
  }

  async #awaitReady(instance: Instance, timeout: number): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        instance.ready,
        instance.exit.then((code) => {
          throw new ShardSpawnError(this.id, code);
        }),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new ShardUnavailableError(this.id, `not ready within ${timeout}ms`)),
            timeout,
          );
        }),
      ]);
      this.manager.recordReadyTime(Date.now() - instance.startedAt);
    } catch (error) {
      instance.stopping = true;
      await this.#kill(instance);
      if (this.#active === instance) this.#active = null;
      throw error;
    } finally {
      clearTimeout(timer);
      instance.awaited = false;
    }
  }

  async #write(instance: Instance | null, packet: Packet): Promise<void> {
    const transport = instance?.transport;
    if (!transport || instance.exited)
      throw new ShardUnavailableError(this.id, "it is not running");
    await transport.send(await this.manager.codec.encode(packet, { channelId: this.id }));
  }

  async #receive(instance: Instance, data: unknown): Promise<void> {
    let packet: Packet;
    try {
      packet = await this.manager.codec.decode(data, { channelId: this.id });
    } catch (error) {
      this.manager.reportInvalidMessage(this, error);
      return;
    }

    const write = (reply: Packet) => this.#write(instance, reply);
    switch (packet.op) {
      case Op.Signal:
        instance.status = packet.status;
        if (packet.status === ShardStatus.Ready && !instance.everReady) {
          instance.everReady = true;
          // From now on, a crash is the supervisor's: whoever spawned the shard is done waiting.
          instance.awaited = false;
          if (instance.slowStart) clearTimeout(instance.slowStart);
          instance.resolveReady();
        }

        if (instance === this.#active) this.#setStatus(packet.status);
        break;
      case Op.Pong:
        if (instance === this.#active) {
          this.ping.receive(packet.sentAt);
          this.emit("ping", this.ping.latency);
          this.manager.emit("shardPing", this, this.ping.latency);
        }

        break;
      case Op.Message:
        if (packet.to === undefined) {
          this.emit("message", packet.body);
          this.manager.emit("message", packet.body, this);
        } else {
          await this.manager
            .route(packet.body, packet.to, this.id)
            .catch((error: unknown) => this.manager.reportError(error));
        }

        break;
      case Op.Request: {
        const { to, timeout, partial, system } = packet;
        const handler = system
          ? (body: unknown, { signal }: { signal: AbortSignal }) =>
              this.manager.handleSystem(system, body, this, signal)
          : to === undefined
            ? this.manager.requestHandler
            : (body: unknown, { signal }: { signal: AbortSignal }) =>
                this.manager.forward(body, to, this.id, { timeout, signal, partial });
        await instance.incoming.handle(write, packet, handler, { channel: this });
        break;
      }
      case Op.Reply:
        this.#outgoing.settle(packet);
        break;
      case Op.Abort:
        instance.incoming.abort(packet.nonce);
        break;
      default:
        this.manager.reportInvalidMessage(this, new TypeError(`Unexpected packet ${packet.op}`));
    }
  }

  #setStatus(status: ShardStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.emit("status", status);
    this.manager.emit("shardStatus", this, status);

    switch (status) {
      case ShardStatus.Ready:
        this.manager.supervisor.ready(this.id);
        this.ping.start();
        for (const waiter of this.#waiters) waiter.resolve();
        this.emit("ready");
        this.manager.emit("shardReady", this);
        break;
      case ShardStatus.Disconnected:
        this.emit("disconnect");
        this.manager.emit("shardDisconnect", this);
        break;
      case ShardStatus.Reconnecting:
        this.emit("reconnecting");
        this.manager.emit("shardReconnecting", this);
        break;
      case ShardStatus.Idle:
        this.ping.stop();
        break;
      default:
        break;
    }
  }

  #estimatedRemaining(): number | null {
    const estimate = this.manager.readyEstimate;
    const active = this.#active;
    if (estimate === null || !active || this.status !== ShardStatus.Starting) return null;

    // Within the margin of error, the shard may still make it: only give up when even the optimistic estimate is late.
    const remaining =
      estimate - (Date.now() - active.startedAt) - estimate * this.manager.readyHintMargin;
    return remaining > 0 ? Math.round(remaining) : null;
  }

  #unresponsive(): void {
    if (
      this.listenerCount("unresponsive") > 0 ||
      this.manager.listenerCount("shardUnresponsive") > 0
    ) {
      this.emit("unresponsive");
      this.manager.emit("shardUnresponsive", this);
    } else {
      void this.restart().catch((error: unknown) => this.manager.reportError(error));
    }
  }

  async #stop(instance: Instance, timeout: number): Promise<void> {
    instance.stopping = true;
    if (instance.exited) return;

    const asked = await this.#write(instance, { op: Op.Close }).then(
      () => true,
      () => false,
    );
    // A shard that cannot be asked (e.g. still waiting for a proxy) is killed right away.
    const timer = setTimeout(() => void this.#kill(instance), asked ? timeout : 0);
    await instance.exit;
    clearTimeout(timer);
  }

  async #kill(instance: Instance): Promise<void> {
    instance.stopping = true;
    if (!instance.exited) await instance.transport?.kill();
  }

  #failed(instance: Instance, error: unknown): void {
    const spawnError = new ShardSpawnError(this.id, null, error);
    if (instance.everReady) this.manager.reportShardError(this, error);
    else this.manager.reportShardError(this, spawnError);
  }

  #exited(instance: Instance, code: number | null): void {
    if (instance.exited) return;
    instance.exited = true;
    if (instance.slowStart) clearTimeout(instance.slowStart);
    instance.incoming.abortAll();
    this.#outgoing.rejectOwner(instance, new ShardUnavailableError(this.id, "it stopped"));
    instance.resolveExit(code);

    // A replacement failing to start, or the old shard of a rolling restart: nothing else to do.
    if (instance !== this.#active) return;

    this.#active = null;
    const previous = instance.status;
    this.#setStatus(ShardStatus.Idle);
    this.emit("exit", code);
    this.manager.emit("shardExit", this, code);

    // The sharder RFC's `error` signal: the shard failed before it was ready.
    if (!instance.everReady && !instance.stopping && code !== 0) {
      this.manager.reportShardError(this, new ShardSpawnError(this.id, code));
    }

    // Whoever stopped or spawned the shard handles what comes next.
    if (instance.stopping || instance.awaited) return;
    this.manager.supervise(this, previous);
  }

  #rejectWaiters(error: unknown): void {
    for (const waiter of this.#waiters) waiter.reject(error);
  }
}
