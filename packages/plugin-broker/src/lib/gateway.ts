import { container } from "@wolfstar/http-framework";
import type { BrokerConsumer } from "../BrokerConsumer.js";
import type { Broker, BrokerPublishOptions } from "./broker.js";
import type { BrokerMessage } from "./types.js";

/**
 * A raw gateway dispatch payload, as emitted by `@wolfstar/plugin-gateway`'s `GatewayClient`.
 */
export interface GatewayDispatchLike {
  /**
   * The dispatch type, e.g. `MESSAGE_CREATE`.
   */
  t: string;
  /**
   * The dispatch data.
   */
  d: unknown;
}

export type GatewayDispatchListener = (
  payload: GatewayDispatchLike,
  shardId: number,
  state?: unknown,
) => void;

/**
 * The subset of `@wolfstar/plugin-gateway`'s `GatewayClient` {@link forwardGatewayDispatches} relies on, so this
 * package does not depend on it.
 */
export interface GatewayDispatchEmitterLike {
  /**
   * Serializes the previous state of a dispatch's entity, which workers revive with
   * {@link GatewayReplayTargetLike.reviveDispatchState}. An emitter without it forwards dispatches without state.
   */
  serializeDispatchState?(type: string, state: unknown): unknown;
  on(event: "dispatch", listener: GatewayDispatchListener): unknown;
  off(event: "dispatch", listener: GatewayDispatchListener): unknown;
}

export interface ForwardGatewayDispatchesOptions {
  /**
   * The dispatch types to forward, e.g. `[GatewayDispatchEvents.MessageCreate]`. Left unset, every dispatch is.
   */
  events?: readonly string[];
  /**
   * Called when publishing a dispatch fails, e.g. while Redis is unreachable.
   *
   * @default Logs the error through `container.logger`.
   */
  onError?: (error: unknown, payload: GatewayDispatchLike) => void;
}

/**
 * Publishes every dispatch a `GatewayClient` from `@wolfstar/plugin-gateway` receives onto a {@link Broker}, under its
 * dispatch type (e.g. `MESSAGE_CREATE`) with its data as payload.
 *
 * @remarks
 * Dispatches are forwarded on the client's `dispatch` event, once they are written to the client's cache: workers
 * sharing that cache (a `@wolfstar/plugin-cache` Redis cache) see the state the dispatch left when they receive it.
 * Publishing does not hold up the gateway, and the entries are added in the order the dispatches were processed.
 * For a `GatewayClient` the entry also carries the dispatch's previous state and shard, which
 * `replayGatewayDispatches` uses on workers.
 *
 * @example
 * ```typescript
 * declare module '@wolfstar/plugin-broker' {
 *   interface BrokerEvents {
 *     MESSAGE_CREATE: GatewayMessageCreateDispatchData;
 *   }
 * }
 *
 * const stop = forwardGatewayDispatches(gatewayClient, broker, { events: [GatewayDispatchEvents.MessageCreate] });
 * ```
 *
 * @param client The gateway client to forward the dispatches of.
 * @param broker The broker to publish them onto.
 * @param options The options for forwarding.
 * @returns A function to stop forwarding.
 */
export function forwardGatewayDispatches(
  client: GatewayDispatchEmitterLike,
  broker: Broker,
  options: ForwardGatewayDispatchesOptions = {},
): () => void {
  const events = options.events ? new Set(options.events) : null;
  const onError =
    options.onError ??
    ((error: unknown, payload: GatewayDispatchLike) =>
      container.logger.error(`[Broker] Failed to forward the ${payload.t} dispatch:`, error));

  const listener: GatewayDispatchListener = (payload, shardId, state) => {
    if (events && !events.has(payload.t)) return;

    const publishOptions: BrokerPublishOptions = {};
    if (state !== undefined && client.serializeDispatchState) {
      try {
        const serialized = client.serializeDispatchState(payload.t, state);
        if (serialized !== undefined) publishOptions.state = serialized;
      } catch (error) {
        // The event matters more than its previous state: a worker still gets it, with the partials it would
        // build for an uncached entity.
        onError(error, payload);
      }
    }
    if (shardId !== 0) publishOptions.shard = shardId;

    const published =
      Object.keys(publishOptions).length === 0
        ? broker.publish(payload.t, payload.d)
        : broker.publish(payload.t, payload.d, publishOptions);
    published.catch((error: unknown) => onError(error, payload));
  };

  client.on("dispatch", listener);
  return () => void client.off("dispatch", listener);
}

/**
 * The subset of `@wolfstar/plugin-gateway`'s `GatewayClient` {@link replayGatewayDispatches} relies on.
 */
export interface GatewayReplayTargetLike {
  /**
   * The dispatch types the client turns into events.
   */
  readonly replayDispatchTypes: readonly string[];
  replayDispatch(
    payload: { t: string; d: unknown },
    shardId: number,
    state?: unknown,
  ): Promise<void>;
  reviveDispatchState(type: string, state: unknown, data: unknown): Promise<unknown>;
}

export interface ReplayGatewayDispatchesOptions {
  /**
   * The dispatch types to replay, e.g. `[GatewayDispatchEvents.MessageUpdate]`.
   *
   * @default Every type the client handles ({@link GatewayReplayTargetLike.replayDispatchTypes}).
   */
  events?: readonly string[];
}

/**
 * Replays the dispatches {@link forwardGatewayDispatches} publishes on a `GatewayClient` that never connects to Discord:
 * its listeners receive the same events, with the same Structures and previous state, as those of the gateway
 * process's client.
 *
 * @remarks
 * The worker's client must share the gateway process's cache (a `@wolfstar/plugin-cache` Redis cache). An entry is
 * acknowledged once the replay resolved: a listener that throws leaves it pending, to be redelivered like any
 * failing {@link BrokerListener} entry. Relations of the previous state (author, guild, …) resolve from the cache as
 * it is when the worker handles the entry, so they can be newer than the dispatch.
 *
 * @example
 * ```typescript
 * // On a gateway process
 * forwardGatewayDispatches(gatewayClient, broker);
 *
 * // On a worker, with a `GatewayClient` that is never connected
 * replayGatewayDispatches(consumer, workerClient);
 * ```
 *
 * @param consumer The consumer reading the stream the dispatches are forwarded to.
 * @param client The client to replay them on.
 * @param options The options for replaying.
 * @returns A function to stop replaying.
 */
export function replayGatewayDispatches(
  consumer: Pick<BrokerConsumer, "on" | "off">,
  client: GatewayReplayTargetLike,
  options: ReplayGatewayDispatchesOptions = {},
): () => void {
  const registered: [type: string, listener: (...args: readonly unknown[]) => Promise<void>][] = [];

  for (const type of options.events ?? client.replayDispatchTypes) {
    const listener = async (...args: readonly unknown[]): Promise<void> => {
      const [data, message] = args as [unknown, BrokerMessage];
      const state = await client.reviveDispatchState(type, message.state, data);
      await client.replayDispatch({ t: type, d: data }, message.shard ?? 0, state);
    };

    consumer.on(type, listener);
    registered.push([type, listener]);
  }

  return () => {
    for (const [type, listener] of registered) consumer.off(type, listener);
  };
}
