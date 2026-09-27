import { container } from "@wolfstar/http-framework";
import type { Broker } from "./broker.js";

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

/**
 * The subset of `@wolfstar/plugin-gateway`'s `GatewayClient` {@link forwardGatewayDispatches} relies on, so this
 * package does not depend on it.
 */
export interface GatewayDispatchEmitterLike {
  on(event: "dispatch", listener: (payload: GatewayDispatchLike, shardId: number) => void): unknown;
  off(
    event: "dispatch",
    listener: (payload: GatewayDispatchLike, shardId: number) => void,
  ): unknown;
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

  const listener = (payload: GatewayDispatchLike) => {
    if (events && !events.has(payload.t)) return;
    broker.publish(payload.t, payload.d).catch((error: unknown) => onError(error, payload));
  };

  client.on("dispatch", listener);
  return () => void client.off("dispatch", listener);
}
