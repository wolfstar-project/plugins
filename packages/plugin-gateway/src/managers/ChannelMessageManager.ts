import type { GatewayClient } from "../GatewayClient.js";
import type { Message } from "../structures/Message.js";
import type { FetchOptions } from "./CachedManager.js";
import type { MessageListOptions, PinnedMessage } from "./MessageManager.js";
import type {
  MessageCreateOptions,
  MessageEditOptions,
  MessagePayloadResolvable,
} from "../util/messages.js";

/**
 * Manages the messages of one channel: `client.messages`, with the channel's ID filled in.
 */
export class ChannelMessageManager {
  public readonly client: GatewayClient;
  public readonly channelId: string;

  public constructor(client: GatewayClient, channelId: string) {
    this.client = client;
    this.channelId = channelId;
  }

  /**
   * Gets a message of the channel from the cache.
   */
  public get(messageId: string): Promise<Message | undefined> {
    return this.client.messages.get(this.channelId, messageId);
  }

  /**
   * Gets a message of the channel from the cache, falling back to the API.
   */
  public fetch(messageId: string, options?: FetchOptions): Promise<Message> {
    return options
      ? this.client.messages.fetch(this.channelId, messageId, options)
      : this.client.messages.fetch(this.channelId, messageId);
  }

  /**
   * Lists the messages of the channel, newest first.
   */
  public list(options?: MessageListOptions): Promise<Message[]> {
    return this.client.messages.list(this.channelId, options);
  }

  public send(options: MessagePayloadResolvable<MessageCreateOptions>): Promise<Message> {
    return this.client.messages.send(this.channelId, options);
  }

  public edit(
    messageId: string,
    options: MessagePayloadResolvable<MessageEditOptions>,
  ): Promise<Message> {
    return this.client.messages.edit(this.channelId, messageId, options);
  }

  public delete(messageId: string, reason?: string): Promise<void> {
    return this.client.messages.delete(this.channelId, messageId, reason);
  }

  public fetchPins(options?: { limit?: number; before?: Date | number }): Promise<{
    items: PinnedMessage[];
    hasMore: boolean;
  }> {
    return this.client.messages.fetchPins(this.channelId, options);
  }

  public pin(messageId: string, reason?: string): Promise<void> {
    return this.client.messages.pin(this.channelId, messageId, reason);
  }

  public unpin(messageId: string, reason?: string): Promise<void> {
    return this.client.messages.unpin(this.channelId, messageId, reason);
  }

  public crosspost(messageId: string): Promise<Message> {
    return this.client.messages.crosspost(this.channelId, messageId);
  }
}
