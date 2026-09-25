import {
  Op,
  serializeError,
  type Packet,
  type SerializedSettledResult,
} from "../messages/protocol.js";
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
   * Aborts the request: dropped from the queue if it waits for a shard to be ready, and aborted on the other side
   * otherwise, whose handler gets an aborted `signal`.
   */
  signal?: AbortSignal;
}

/**
 * The options of a broadcast request.
 */
export interface BroadcastRequestOptions extends RequestOptions {
  /**
   * Whether to resolve with the outcome of every shard, like `Promise.allSettled`, rather than rejecting on the first
   * failure: the replies that came before a timeout or an abort are kept.
   */
  partial?: boolean;
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
type RequestPacket = Extract<Packet, { op: typeof Op.Request }>;
type RequestFields = Omit<RequestPacket, "op" | "nonce" | "timeout">;

interface Pending {
  owner: unknown;
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
  readonly #step: 1 | -1;
  #nonce = 0;

  /**
   * @param negative Whether to count nonces down from -1, so two senders on one channel never collide.
   */
  public constructor(negative = false) {
    this.#step = negative ? -1 : 1;
  }

  /**
   * Sends a request.
   *
   * @param send Writes the request.
   * @param fields The request.
   * @param timeout How long to wait for the reply.
   * @param signal Aborts the request.
   * @param owner What the request was sent to, to reject it with {@link OutgoingRequests.rejectOwner}.
   */
  public request(
    send: Send,
    fields: RequestFields,
    timeout: number,
    signal?: AbortSignal,
    owner?: unknown,
  ): Promise<unknown> {
    signal?.throwIfAborted();
    this.#nonce += this.#step;
    const nonce = this.#nonce;

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
        owner,
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

  /**
   * Settles the request a reply answers. Returns whether it answered one of these requests.
   */
  public settle(packet: Extract<Packet, { op: typeof Op.Reply }>): boolean {
    const pending = this.#pending.get(packet.nonce);
    if (!pending) return false;

    if (packet.error)
      pending.reject(new ShardRequestError(packet.error.name, packet.error.message));
    else pending.resolve(packet.body);
    return true;
  }

  public rejectOwner(owner: unknown, error: unknown): void {
    for (const pending of this.#pending.values()) {
      if (pending.owner === owner) pending.reject(error);
    }
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
    packet: RequestPacket,
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

/**
 * Serializes the outcomes of a partial broadcast.
 *
 * @internal
 */
export function serializeSettled(
  results: readonly PromiseSettledResult<unknown>[],
): SerializedSettledResult[] {
  return results.map((result) =>
    result.status === "fulfilled"
      ? { status: "fulfilled", value: result.value }
      : { status: "rejected", reason: serializeError(result.reason) },
  );
}

/**
 * Rebuilds the outcomes of a partial broadcast.
 *
 * @internal
 */
export function deserializeSettled<Reply>(
  results: readonly SerializedSettledResult[],
): PromiseSettledResult<Reply>[] {
  return results.map((result) =>
    result.status === "fulfilled"
      ? { status: "fulfilled", value: result.value as Reply }
      : {
          status: "rejected",
          reason: new ShardRequestError(result.reason.name, result.reason.message),
        },
  );
}
