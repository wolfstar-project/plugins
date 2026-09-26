import type { GatewayDispatchPayload } from "discord-api-types/v10";
import { applyGatewayDispatch, type CacheOperationContext } from "./operations.js";
import type { Cache } from "./types.js";

/** A gateway that emits the dispatch event used by @discordjs/ws and @discordjs/core. */
export interface GatewayDispatchSource {
  on(
    event: "dispatch",
    listener: (payload: GatewayDispatchPayload, shardId: number) => void,
  ): unknown;
  off?(
    event: "dispatch",
    listener: (payload: GatewayDispatchPayload, shardId: number) => void,
  ): unknown;
}

export interface CacheGatewayOptions extends CacheOperationContext {
  /** Receives cache write failures from the asynchronous gateway listener. */
  onError?: (error: unknown, payload: GatewayDispatchPayload, shardId: number) => void;
}

/**
 * Writes gateway dispatches into a cache. Call the returned function to stop listening.
 * Use this when a gateway has no GatewayClient managing its dispatch queue.
 */
export function attachCacheToGateway(
  gateway: GatewayDispatchSource,
  cache: Cache,
  options: CacheGatewayOptions = {},
): () => void {
  const listener = (payload: GatewayDispatchPayload, shardId: number): void => {
    void applyGatewayDispatch(cache, payload, { clientUserId: options.clientUserId }).catch(
      (error) => {
        if (options.onError) options.onError(error, payload, shardId);
        else console.error("Failed to cache gateway dispatch", error);
      },
    );
  };

  gateway.on("dispatch", listener);
  return () => gateway.off?.("dispatch", listener);
}
