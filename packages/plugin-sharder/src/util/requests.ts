import { Op, serializeError, type Packet, type ShardTarget } from "../messages/protocol.js";
import { ShardRequestError, ShardRequestTimeoutError } from "./errors.js";

/**
 * The options of a request.
 */
export interface RequestOptions {
  /**
   * How long to wait for the reply, in milliseconds. Defaults to the manager's `requestTimeout`.
   */
  timeout?: number;
  /**
   * Aborts the request, which also tells the other side to abort its handler.
   */
  signal?: AbortSignal;
}

/**
 * Answers the requests of the other side. Its return value (or the value it resolves to) is the reply, and a throw is
 * rejected on the other side as a {@link ShardRequestError}.
 */
export type RequestHandler<Context> = (
  body: any,
  context: Context & { signal: AbortSignal },
) => unknown;

type Send = (packet: Packet) => Promise<void>;

interface Pending {
  resolve(value: unknown): void;
  reject(error: unknown): void;
}

/**
 * Tracks the requests sent on a channel until their reply comes, they time out, or they are aborted.
 *
 * @internal
 */
export class OutgoingRequests {
  readonly #pending = new Map<number, Pending>();
  #nonce = 0;

  public get size(): number {
    return this.#pending.size;
  }

  public request(
    send: Send,
    fields: { body: unknown; to?: ShardTarget; from?: number | null },
    timeout: number,
    signal?: AbortSignal,
  ): Promise<unknown> {
    signal?.throwIfAborted();
    const nonce = ++this.#nonce;

    return new Promise((resolve, reject) => {
      const abort = (error: unknown) => {
        if (!this.#pending.has(nonce)) return;
        settle();
        reject(error);
        void send({ op: Op.Abort, nonce }).catch(() => undefined);
      };

      const timer = setTimeout(() => abort(new ShardRequestTimeoutError(timeout)), timeout);
      const onAbort = () => abort(signal!.reason);
      signal?.addEventListener("abort", onAbort, { once: true });
      const settle = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        this.#pending.delete(nonce);
      };

      this.#pending.set(nonce, {
        resolve: (value) => {
          settle();
          resolve(value);
        },
        reject: (error) => {
          settle();
          reject(error);
        },
      });

      send({ op: Op.Request, nonce, ...fields, timeout }).catch((error: unknown) => {
        this.#pending.get(nonce)?.reject(error);
      });
    });
  }

  public settle(packet: Extract<Packet, { op: typeof Op.Reply }>): void {
    const pending = this.#pending.get(packet.nonce);
    if (!pending) return;

    if (packet.error)
      pending.reject(new ShardRequestError(packet.error.name, packet.error.message));
    else pending.resolve(packet.body);
  }

  public rejectAll(error: unknown): void {
    for (const pending of this.#pending.values()) pending.reject(error);
  }
}

/**
 * Runs the requests received on a channel, and aborts them when the other side does.
 *
 * @internal
 */
export class IncomingRequests {
  readonly #controllers = new Map<number, AbortController>();

  public async handle<Context>(
    send: Send,
    packet: Extract<Packet, { op: typeof Op.Request }>,
    handler: RequestHandler<Context> | null,
    context: Context,
  ): Promise<void> {
    const controller = new AbortController();
    this.#controllers.set(packet.nonce, controller);

    let reply: Packet;
    try {
      if (!handler) throw new Error("There is no request handler");
      const body = await handler(packet.body, { ...context, signal: controller.signal });
      reply = { op: Op.Reply, nonce: packet.nonce, body };
    } catch (error) {
      reply = { op: Op.Reply, nonce: packet.nonce, error: serializeError(error) };
    } finally {
      this.#controllers.delete(packet.nonce);
    }

    // Nobody waits for the reply of an aborted request.
    if (!controller.signal.aborted) await send(reply).catch(() => undefined);
  }

  public abort(nonce: number): void {
    this.#controllers.get(nonce)?.abort(new Error("The request was aborted by its sender"));
  }

  public abortAll(): void {
    for (const nonce of this.#controllers.keys()) this.abort(nonce);
  }
}
