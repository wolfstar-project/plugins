import type { Collection } from "@discordjs/collection";
import type { ChannelType } from "discord-api-types/v10";
import type { MessageResolvable } from "../../../types.js";
import type { Message, PartialMessage } from "../../messages/Message.js";
import type { Channel } from "../Channel.js";

export interface TextGuildChannelMixin<
  Type extends ChannelType = ChannelType,
> extends Channel<Type> {}

/**
 * Adds the actions of text-based channels of a guild only: discord.js's `TextBasedChannel` leaves them out of direct
 * messages, where Discord refuses them.
 */
export class TextGuildChannelMixin<Type extends ChannelType = ChannelType> {
  /**
   * Deletes up to 100 messages at once, like discord.js's `TextBasedChannel#bulkDelete`.
   *
   * @param messages The messages, their IDs, or how many of the latest ones to delete.
   * @param filterOld Whether to drop the messages older than 14 days, which Discord refuses.
   * @returns The deleted messages by ID: the cached one, else a partial one with `Partials.Message`, else `undefined`.
   */
  public bulkDelete(
    messages: Collection<string, Message> | readonly MessageResolvable[] | number,
    filterOld = false,
  ): Promise<Collection<string, Message | PartialMessage | undefined>> {
    return this.client.messages.bulkDelete(this.id, messages, filterOld);
  }
}
