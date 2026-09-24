import type { ChannelType } from "discord-api-types/v10";
import type { Channel } from "../Channel.js";
import { kData } from "../Structure.js";

type Data = { last_message_id?: string | null; last_pin_timestamp?: string | null };

export interface TextChannelMixin<Type extends ChannelType = ChannelType> extends Channel<Type> {}

/**
 * Adds the fields of channels holding messages.
 */
export class TextChannelMixin<Type extends ChannelType = ChannelType> {
  public get lastMessageId(): string | null {
    return (this[kData] as Data).last_message_id ?? null;
  }

  public get lastPinTimestamp(): number | null {
    const { last_pin_timestamp: lastPinTimestamp } = this[kData] as Data;
    return lastPinTimestamp ? Date.parse(lastPinTimestamp) : null;
  }
}
