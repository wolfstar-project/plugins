// Type-level test, checked by the root `typecheck` script through `tsconfig.consumption.json`: a `GatewayClient` from
// `@wolfstar/plugin-gateway` must be accepted by `forwardGatewayDispatches` and `replayGatewayDispatches` as it is,
// without any cast.
import type { GatewayClient } from "@wolfstar/plugin-gateway";
import {
  forwardGatewayDispatches,
  replayGatewayDispatches,
  type Broker,
  type BrokerConsumer,
  type GatewayDispatchEmitterLike,
  type GatewayReplayTargetLike,
} from "../../src/index.js";

declare const gatewayClient: GatewayClient;
declare const broker: Broker;
declare const consumer: BrokerConsumer;

export const emitter: GatewayDispatchEmitterLike = gatewayClient;
export const stop: () => void = forwardGatewayDispatches(gatewayClient, broker, {
  events: ["MESSAGE_CREATE"],
});

export const target: GatewayReplayTargetLike = gatewayClient;
export const stopReplaying: () => void = replayGatewayDispatches(consumer, gatewayClient, {
  events: ["MESSAGE_CREATE"],
});
