import { Routes, type ChannelType } from "discord-api-types/v10";
import { ChannelMessageManager } from "../../managers/ChannelMessageManager.js";
import { container, getGatewayClient } from "../../util/container.js";
import type { MessageCreateOptions, MessagePayloadResolvable } from "../../util/messages.js";
import type { Channel } from "../Channel.js";
import type { Message } from "../Message.js";
import { kData } from "../Structure.js";

type Data = { last_message_id?: string | null; last_pin_timestamp?: string | null };

export interface TextChannelMixin<Type extends ChannelType = ChannelType> extends Channel<Type> {}

/**
 * Adds the fields and message actions of channels holding messages.
 */
export class TextChannelMixin<Type extends ChannelType = ChannelType> {
  public get lastMessageId(): string | null {
    return (this[kData] as Data).last_message_id ?? null;
  }

  public get lastPinTimestamp(): number | null {
    const { last_pin_timestamp: lastPinTimestamp } = this[kData] as Data;
    return lastPinTimestamp ? Date.parse(lastPinTimestamp) : null;
  }

  public get lastPinAt(): Date | null {
    const { lastPinTimestamp } = this;
    return lastPinTimestamp === null ? null : new Date(lastPinTimestamp);
  }

  /**
   * The messages of the channel.
   */
  public get messages(): ChannelMessageManager {
    return new ChannelMessageManager(getGatewayClient(), this.id);
  }

  /**
   * Sends a message to the channel.
   *
   * @param options The message, or its content.
   */
  public send(options: MessagePayloadResolvable<MessageCreateOptions>): Promise<Message> {
    return getGatewayClient().messages.send(this.id, options);
  }

  /**
   * Shows the bot as typing in the channel, for about 10 seconds or until it sends a message.
   */
  public async sendTyping(): Promise<void> {
    await container.rest.post(Routes.channelTyping(this.id));
  }

  /**
   * Deletes up to 100 messages at once.
   *
   * @param messages The IDs of the messages, or how many of the latest ones to delete.
   * @param filterOld Whether to drop the messages older than 14 days, which Discord refuses.
   * @returns The IDs of the deleted messages.
   */
  public bulkDelete(messages: readonly string[] | number, filterOld = false): Promise<string[]> {
    return getGatewayClient().messages.bulkDelete(this.id, messages, filterOld);
  }

  /**
   * Fetches the last message of the channel, cache first.
   */
  public async fetchLastMessage(): Promise<Message | null> {
    const { lastMessageId } = this;
    return lastMessageId ? getGatewayClient().messages.fetch(this.id, lastMessageId) : null;
  }
}
