import { messageKey, type CacheEntityTypes } from "@wolfstar/plugin-cache";
import { Routes, type APIMessage } from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import { Message } from "../structures/Message.js";
import { container } from "../util/container.js";
import { CachedManager } from "./CachedManager.js";

/**
 * Manages the {@link Message}s known to the client.
 */
export class MessageManager extends CachedManager<
  "messages",
  Message,
  [channelId: string, messageId: string]
> {
  public constructor(client: GatewayClient) {
    super(client, "messages");
  }

  public createStructure(data: CacheEntityTypes["messages"]): Message {
    return new Message(data);
  }

  public resolveKey(channelId: string, messageId: string): string {
    return messageKey(channelId, messageId);
  }

  protected async fetchRaw(channelId: string, messageId: string) {
    return (await container.rest.get(Routes.channelMessage(channelId, messageId))) as APIMessage;
  }
}
