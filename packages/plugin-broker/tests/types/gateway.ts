// Type-level test, checked by the root `typecheck` script through `tsconfig.consumption.json`: a `GatewayClient` from
// `@wolfstar/plugin-gateway` must be accepted by `forwardGatewayDispatches` as it is, without any cast.
import type { GatewayClient } from "@wolfstar/plugin-gateway";
import {
  forwardGatewayDispatches,
  type Broker,
  type GatewayDispatchEmitterLike,
} from "../../src/index.js";

declare const gatewayClient: GatewayClient;
declare const broker: Broker;

export const emitter: GatewayDispatchEmitterLike = gatewayClient;
export const stop: () => void = forwardGatewayDispatches(gatewayClient, broker, {
  events: ["MESSAGE_CREATE"],
});
