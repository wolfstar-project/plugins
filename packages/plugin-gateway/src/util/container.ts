import { container } from "@wolfstar/http-framework";
import type { GatewayClient } from "../GatewayClient.js";
import { GatewayError } from "../errors/GatewayError.js";

/**
 * Gets the {@link GatewayClient} registered in the framework's container.
 *
 * @remarks
 * The framework's `Client` registers itself as `container.client` on construction, so this is the most recently
 * constructed `GatewayClient`. It throws when that client is a plain `Client`.
 */
export function getGatewayClient(): GatewayClient {
  const { client } = container;
  if (!client || !("gateway" in client)) {
    throw new GatewayError("ClientNotConstructed");
  }

  return client as GatewayClient;
}

/**
 * Gets the {@link GatewayClient} registered in the framework's container, if any: {@link getGatewayClient} for the
 * code that can do without a client.
 *
 * @internal
 */
export function existingGatewayClient(): GatewayClient | undefined {
  const { client } = container;
  return client && "gateway" in client ? (client as GatewayClient) : undefined;
}

declare module "@sapphire/pieces" {
  interface Container {
    /**
     * The most recently constructed {@link GatewayClient}, which registers itself here on construction next to
     * `container.client`, so pieces reach its managers without {@link getGatewayClient} or a cast.
     *
     * @remarks
     * `container.client` keeps the framework's `Client` type: a module augmentation cannot redeclare a property with
     * another type (TS2717), and under `skipLibCheck` the framework's declaration silently wins.
     */
    gatewayClient: GatewayClient;
  }
}
