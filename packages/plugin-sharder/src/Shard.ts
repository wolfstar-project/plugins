import type { ShardManager } from "./ShardManager.js";
import type { ChannelData } from "./messages/MessageHandler.js";
import { Op, ShardStatus, type Packet } from "./messages/protocol.js";
import type { ShardTransport } from "./strategies/ChannelStrategy.js";
import { ShardUnavailableError } from "./util/errors.js";
import { IncomingRequests, OutgoingRequests, type RequestOptions } from "./util/requests.js";

interface ReadyWaiter {
  resolve(): void;
  reject(error: unknown): void;
}

/**
 * The manager's handle on one shard: a process, cluster worker, or worker thread connecting some gateway shards.
 *
 * @remarks
 * "Shard" follows discord.js's sharder RFC: it is the client the manager spawns, which may connect several gateway
 * shards, not a gateway shard itself.
 */
export class Shard {
  /**
   * The ID of the shard, its index in {@link ShardManager.shards}.
   */
  public readonly id: number;

  /**
   * The IDs of the gateway shards the shard connects.
   */
  public readonly shards: readonly number[];

  public readonly manager: ShardManager;

  /**
   * The last status the shard signalled, `Idle` while it is not running.
   */
  public status: ShardStatus = ShardStatus.Idle;

  /**
   * When the shard last pinged its manager, `null` before its first ping.
   */
  public lastPingTimestamp: number | null = null;

  #transport: ShardTransport | null = null;
  #exit: Promise<void> = Promise.resolve();
  #resolveExit: () => void = () => undefined;
  #starting = false;
  #stopping = false;
  #stopped = false;
  #failures = 0;
  #watchdog: NodeJS.Timeout | null = null;
  readonly #readyWaiters = new Set<ReadyWaiter>();
  readonly #outgoing = new OutgoingRequests();
  readonly #incoming = new IncomingRequests();

  public constructor(manager: ShardManager, id: number, shards: readonly number[]) {
    this.manager = manager;
    this.id = id;
    this.shards = shards;
  }

  /**
   * Whether the shard is running and signalled that it is ready.
   */
  public get ready(): boolean {
    return this.status === ShardStatus.Ready;
  }

  /**
   * Whether the shard is running: spawned, and not stopped yet.
   */
  public get running(): boolean {
    return this.#transport !== null;
  }

  /**
   * Whether the shard was stopped for good: closed, exited, or out of respawns.
   *
   * @internal
   */
  public get stopped(): boolean {
    return this.#stopped;
  }

  /**
   * Spawns the shard, and waits for it to signal that it is ready.
   *
   * @param timeout How long to wait for it, in milliseconds. Past it, the shard is killed and the promise rejects.
   */
  public async start(timeout = this.manager.spawnTimeout): Promise<void> {
    if (this.#transport) throw new Error(`Shard ${this.id} is already running`);

    this.#stopped = false;
    this.#exit = new Promise((resolve) => {
      this.#resolveExit = resolve;
    });
    this.#transport = this.manager.strategy.spawn(
      {
        id: this.id,
        shards: this.shards,
        shardCount: this.manager.shardCount,
        pingInterval: this.manager.pingInterval,
        requestTimeout: this.manager.requestTimeout,
        transport: this.manager.strategy.transport,
      },
      {
        message: (data) => void this.#receive(data),
        exit: (code) => this.#exited(code),
        error: (error) => this.manager.reportError(error),
      },
    );
    this.#setStatus(ShardStatus.Starting);
    this.manager.emit("shardCreate", this);

    this.#starting = true;
    const exited = this.#exit.then(() => {
      throw new ShardUnavailableError(this.id, "it exited before it was ready");
    });
    try {
      await Promise.race([this.waitForReady(timeout), exited]);
    } catch (error) {
      await this.#kill();
      throw error;
    } finally {
      this.#starting = false;
    }
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
    if (!this.#transport) return;

    this.#stopping = true;
    const transport = this.#transport;
    const exited = this.#exit;
    await this.#write({ op: Op.Close }).catch(() => undefined);
    const timer = setTimeout(() => void transport.kill(), timeout);
    await exited;
    clearTimeout(timer);
    this.manager.emit("shardDestroy", this);
  }

  /**
   * Closes the shard, then starts it again through the manager's spawn queue.
   */
  public restart(): Promise<void> {
    return this.manager.restart(this.id);
  }

  /**
   * Waits for the shard to be ready.
   *
   * @param timeout How long to wait, in milliseconds.
   * @throws A {@link ShardUnavailableError} when it is stopped for good, or not ready in time.
   */
  public waitForReady(timeout = this.manager.requestTimeout): Promise<void> {
    if (this.ready) return Promise.resolve();
    if (this.#stopped) {
      return Promise.reject(new ShardUnavailableError(this.id, "it is stopped"));
    }

    return new Promise((resolve, reject) => {
      const waiter: ReadyWaiter = {
        resolve: () => {
          clearTimeout(timer);
          this.#readyWaiters.delete(waiter);
          resolve();
        },
        reject: (error) => {
          clearTimeout(timer);
          this.#readyWaiters.delete(waiter);
          reject(error);
        },
      };
      const timer = setTimeout(
        () => waiter.reject(new ShardUnavailableError(this.id, `not ready within ${timeout}ms`)),
        timeout,
      );
      this.#readyWaiters.add(waiter);
    });
  }

  /**
   * Sends a message to the shard, emitted as `message` by its {@link ShardClient}. Waits for the shard to be ready.
   *
   * @param body The message.
   * @param from The shard the message comes from, `null` for the manager.
   */
  public async send(body: unknown, from: number | null = null): Promise<void> {
    await this.waitForReady();
    await this.#write({ op: Op.Message, body, from });
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
    const timeout = options.timeout ?? this.manager.requestTimeout;
    const started = Date.now();
    await this.waitForReady(timeout);
    return this.#outgoing.request(
      (packet) => this.#write(packet),
      { body, from },
      Math.max(timeout - (Date.now() - started), 1),
      options.signal,
    ) as Promise<Reply>;
  }

  async #write(packet: Packet): Promise<void> {
    const transport = this.#transport;
    if (!transport) throw new ShardUnavailableError(this.id, "it is not running");
    await transport.send(await this.manager.codec.encode(packet));
  }

  async #receive(data: ChannelData): Promise<void> {
    let packet: Packet;
    try {
      packet = await this.manager.codec.decode(data);
    } catch (error) {
      this.manager.reportInvalidMessage(this, error);
      return;
    }

    const write = (reply: Packet) => this.#write(reply);
    switch (packet.op) {
      case Op.Signal:
        this.#setStatus(packet.status);
        break;
      case Op.Ping:
        this.lastPingTimestamp = Date.now();
        this.#watchdog?.refresh();
        await write({ op: Op.Pong, sentAt: packet.sentAt }).catch(() => undefined);
        this.manager.emit("shardPing", this, this.lastPingTimestamp - packet.sentAt);
        break;
      case Op.Message:
        if (packet.to === undefined) this.manager.emit("message", packet.body, this);
        else
          await this.manager.route(packet.body, packet.to, this.id).catch((error: unknown) => {
            this.manager.reportError(error);
          });
        break;
      case Op.Request: {
        const { to, timeout } = packet;
        const handler =
          to === undefined
            ? this.manager.requestHandler
            : (body: unknown, { signal }: { signal: AbortSignal }) =>
                this.manager.forward(body, to, this.id, { timeout, signal });
        await this.#incoming.handle(write, packet, handler, { shard: this });
        break;
      }
      case Op.Reply:
        this.#outgoing.settle(packet);
        break;
      case Op.Abort:
        this.#incoming.abort(packet.nonce);
        break;
      default:
        this.manager.reportInvalidMessage(this, new TypeError(`Unexpected packet ${packet.op}`));
    }
  }

  #setStatus(status: ShardStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.manager.emit("shardStatus", this, status);
    if (status !== ShardStatus.Ready) return;

    this.#failures = 0;
    this.#startWatchdog();
    for (const waiter of this.#readyWaiters) waiter.resolve();
    this.manager.emit("shardReady", this);
  }

  #startWatchdog(): void {
    this.#stopWatchdog();
    this.#watchdog = setTimeout(() => {
      this.#watchdog = null;
      if (this.manager.listenerCount("shardUnresponsive") > 0) {
        this.manager.emit("shardUnresponsive", this);
      } else {
        void this.restart().catch((error: unknown) => this.manager.reportError(error));
      }
    }, this.manager.pingTimeout);
    this.#watchdog.unref();
  }

  #stopWatchdog(): void {
    if (this.#watchdog) clearTimeout(this.#watchdog);
    this.#watchdog = null;
  }

  async #kill(): Promise<void> {
    this.#stopping = true;
    await this.#transport?.kill();
  }

  #exited(code: number | null): void {
    const previous = this.status;
    const intentional = this.#stopping;
    this.#stopping = false;
    this.#transport = null;
    this.#stopWatchdog();
    this.#outgoing.rejectAll(new ShardUnavailableError(this.id, "it stopped"));
    this.#incoming.abortAll();
    this.#setStatus(ShardStatus.Idle);
    this.manager.emit("shardExit", this, code);
    this.#resolveExit();

    // A shard failing to start is retried by whoever started it.
    if (intentional || this.#starting) return;
    if (previous === ShardStatus.Exiting) {
      this.#stopped = true;
      this.#rejectWaiters(new ShardUnavailableError(this.id, "it exited"));
      return;
    }

    // A shard signalling `Restarting` is always restarted; a crash only within the respawn budget.
    if (previous !== ShardStatus.Restarting) {
      if (this.manager.respawns !== -1 && this.#failures >= this.manager.respawns) {
        this.#stopped = true;
        this.#rejectWaiters(new ShardUnavailableError(this.id, "it crashed too many times"));
        return;
      }

      ++this.#failures;
    }

    this.manager.emit("shardRestart", this);
    this.manager.respawn(this);
  }

  #rejectWaiters(error: unknown): void {
    for (const waiter of this.#readyWaiters) waiter.reject(error);
  }
}
