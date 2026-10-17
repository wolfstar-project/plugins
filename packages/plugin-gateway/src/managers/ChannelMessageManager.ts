import type { Collection } from "@discordjs/collection";
import { ChannelType } from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import type { Message, PartialMessage } from "../structures/messages/Message.js";
import type { MessageResolvable } from "../types.js";
import type { FetchOptions } from "./CachedManager.js";
import type { EmojiIdentifierResolvable } from "../structures/emojis/ReactionEmoji.js";
import type { User } from "../structures/users/User.js";
import type {
  MessageListOptions,
  MessageThreadCreateOptions,
  PinnedMessage,
} from "./MessageManager.js";
import type { AnyThreadChannel } from "./ThreadManager.js";
import type {
  MessageCreateOptions,
  MessageEditOptions,
  MessagePayloadResolvable,
} from "../util/messages.js";
import { GatewayError } from "../errors/GatewayError.js";
import { scopeCache, type ScopedCache } from "../util/cache.js";
import { BaseManager } from "./BaseManager.js";

/**
 * Manages the messages of one channel: `client.messages`, with the channel's ID filled in.
 *
 * @remarks
 * One class serves every channel, where discord.js has a `MessageManager` subclass per kind (`GuildMessageManager`,
 * `DMMessageManager`, `PartialGroupDMMessageManager`). The methods only a guild has (`crosspost`, `bulkDelete`,
 * `startThread`) throw `ChannelMessagesGuildOnly` before any request when the manager belongs to a direct message or a
 * group direct message, which the channel's own `messages` tells. A manager built by hand without the channel's type
 * sends the request, and Discord refuses it.
 */
export class ChannelMessageManager extends BaseManager {
  public readonly channelId: string;

  /**
   * The type of the channel, when known.
   */
  public readonly channelType: ChannelType | null;

  /**
   * The cached messages of the channel, by message ID.
   *
   * @example
   * ```typescript
   * const message = await channel.messages.cache.get(messageId);
   * ```
   */
  public readonly cache: ScopedCache<Message>;

  public constructor(
    client: GatewayClient,
    channelId: string,
    channelType: ChannelType | null = null,
  ) {
    super(client);
    this.channelId = channelId;
    this.channelType = channelType;
    this.cache = scopeCache(client.messages.cache, (messageId) =>
      client.messages.resolveKey(channelId, messageId),
    );
  }

  /**
   * Gets a message of the channel from the cache. Same as `cache.get`, always answering a promise.
   */
  public async get(messageId: string): Promise<Message | undefined> {
    return this.cache.get(messageId);
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

  /**
   * Publishes a message of an announcement channel to the channels following it, like discord.js's
   * `GuildMessageManager#crosspost`.
   *
   * @param messageId The ID of the message.
   * @throws {@link GatewayError} `ChannelMessagesGuildOnly` in a direct message.
   */
  public async crosspost(messageId: string): Promise<Message> {
    this.assertGuild("crosspost");
    return this.client.messages.crosspost(this.channelId, messageId);
  }

  /**
   * Deletes up to 100 messages at once.
   *
   * @throws {@link GatewayError} `ChannelMessagesGuildOnly` in a direct message, as the channel has no `bulkDelete`.
   */
  public async bulkDelete(
    messages: Collection<string, Message> | readonly MessageResolvable[] | number,
    filterOld = false,
  ): Promise<Collection<string, Message | PartialMessage | undefined>> {
    this.assertGuild("bulkDelete");
    return this.client.messages.bulkDelete(this.channelId, messages, filterOld);
  }

  public forward(messageId: string, targetChannelId: string): Promise<Message> {
    return this.client.messages.forward(this.channelId, messageId, targetChannelId);
  }

  public react(messageId: string, emoji: EmojiIdentifierResolvable): Promise<void> {
    return this.client.messages.react(this.channelId, messageId, emoji);
  }

  public removeReactionEmoji(messageId: string, emoji: EmojiIdentifierResolvable): Promise<void> {
    return this.client.messages.removeReactionEmoji(this.channelId, messageId, emoji);
  }

  public removeAllReactions(messageId: string): Promise<void> {
    return this.client.messages.removeAllReactions(this.channelId, messageId);
  }

  /**
   * Starts a thread from a message.
   *
   * @throws {@link GatewayError} `ChannelMessagesGuildOnly` in a direct message.
   */
  public async startThread(
    messageId: string,
    options: MessageThreadCreateOptions,
  ): Promise<AnyThreadChannel> {
    this.assertGuild("startThread");
    return this.client.messages.startThread(this.channelId, messageId, options);
  }

  public endPoll(messageId: string): Promise<Message> {
    return this.client.messages.endPoll(this.channelId, messageId);
  }

  public fetchPollAnswerVoters(
    messageId: string,
    answerId: number,
    options?: { limit?: number; after?: string },
  ): Promise<User[]> {
    return this.client.messages.fetchPollAnswerVoters(this.channelId, messageId, answerId, options);
  }

  private assertGuild(action: string): void {
    if (this.channelType === ChannelType.DM || this.channelType === ChannelType.GroupDM) {
      throw new GatewayError("ChannelMessagesGuildOnly", this.channelId, action);
    }
  }
}
