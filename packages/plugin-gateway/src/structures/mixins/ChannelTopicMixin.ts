import type { ChannelType } from "discord-api-types/v10";
import type { Channel } from "../Channel.js";
import { kData } from "../Structure.js";

type Data = { topic?: string | null };

export interface ChannelTopicMixin<Type extends ChannelType = ChannelType> extends Channel<Type> {}

/**
 * Adds the topic of text, announcement, forum, and media channels.
 */
export class ChannelTopicMixin<Type extends ChannelType = ChannelType> {
  public get topic(): string | null {
    return (this[kData] as Data).topic ?? null;
  }
}
