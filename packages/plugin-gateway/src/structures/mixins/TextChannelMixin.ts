import type { ChannelType } from "discord-api-types/v10";
import { ChannelMessageManager } from "../../managers/ChannelMessageManager.js";
import { getGatewayClient } from "../../util/container.js";
import type { MessageCreateOptions, MessagePayloadResolvable } from "../../util/messages.js";
import type { Channel, ChannelDataType } from "../Channel.js";
import type { Message } from "../Message.js";
import { kData } from "../Structure.js";

type Data = { last_message_id?: string | null; last_pin_timestamp?: string | null };
const kLastPinTimestamp: unique symbol = Symbol.for(
  "wolfstar.structures.lastPinTimestamp",
) as never;
const kLastPinRaw: unique symbol = Symbol.for("wolfstar.structures.lastPinRaw") as never;

export interface TextChannelMixin<Type extends ChannelType = ChannelType> extends Channel<Type> {}

/**
 * Adds the fields and message actions of channels holding messages.
 */
export class TextChannelMixin<Type extends ChannelType = ChannelType> {
  public static DataTemplate = {
    set last_pin_timestamp(_value: string | null | undefined) {},
  };

  declare protected [kLastPinTimestamp]: number | null | undefined;
  declare protected [kLastPinRaw]: string | null | undefined;

  public static optimizeData(this: Channel, data: Partial<ChannelDataType>): void {
    const { last_pin_timestamp: timestamp } = data as Data;
    if (timestamp !== undefined) {
      (this as TextChannelMixin)[kLastPinTimestamp] = timestamp ? Date.parse(timestamp) : null;
      (this as TextChannelMixin)[kLastPinRaw] = timestamp;
    }
  }

  public static enrichToJSON(this: Channel, data: object): void {
    const raw = (this as TextChannelMixin)[kLastPinRaw];
    if (raw !== undefined) (data as Data).last_pin_timestamp = raw;
  }

  public get lastMessageId(): string | null {
    return (this[kData] as Data).last_message_id ?? null;
  }

  public get lastPinTimestamp(): number | null {
    return this[kLastPinTimestamp] ?? null;
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
    await getGatewayClient().core.api.channels.showTyping(this.id);
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
