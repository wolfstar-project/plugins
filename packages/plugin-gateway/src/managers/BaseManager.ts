import type { GatewayClient } from "../GatewayClient.js";

/**
 * Manages the API methods of a data model, like discord.js's `BaseManager`.
 */
export abstract class BaseManager {
  /**
   * The client that instantiated this manager.
   */
  public readonly client: GatewayClient;

  public constructor(client: GatewayClient) {
    this.client = client;
  }
}
