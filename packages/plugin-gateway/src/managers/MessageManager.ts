import { messageKey, type CacheEntityTypes } from "@wolfstar/plugin-cache";
import {
  MessageReferenceType,
  Routes,
  type APIMessage,
  type APIThreadChannel,
  type RESTGetAPIChannelMessagesPinsResult,
  type RESTGetAPIPollAnswerVotersResult,
  type RESTPostAPIChannelMessagesThreadsJSONBody,
  type ThreadAutoArchiveDuration,
} from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import { Message } from "../structures/Message.js";
import { ReactionEmoji, type EmojiIdentifierResolvable } from "../structures/ReactionEmoji.js";
import { type User } from "../structures/User.js";
import { container } from "../util/container.js";
import {
  resolveMessageOptions,
  type MessageCreateOptions,
  type MessageEditOptions,
  type MessagePayloadResolvable,
} from "../util/messages.js";
import { CachedManager, type AddOptions } from "./CachedManager.js";
import type { AnyThreadChannel } from "./ThreadManager.js";

/**
 * The options to list the messages of a channel with. `before`, `after`, and `around` are exclusive.
 */
export interface MessageListOptions {
  /**
   * How many messages to fetch, up to 100.
   *
   * @default 50
   */
  limit?: number;
  before?: string;
  after?: string;
  around?: string;
}

/**
 * The options to start a thread from a message with.
 */
export interface MessageThreadCreateOptions {
  name: string;
  autoArchiveDuration?: ThreadAutoArchiveDuration;
  rateLimitPerUser?: number;
  reason?: string;
}

/**
 * A pinned message, with the time it was pinned at.
 */
export interface PinnedMessage {
  message: Message;
  pinnedTimestamp: number;
}

/**
 * The upper bound of the messages `bulkDelete` accepts: Discord refuses messages older than 14 days.
 */
const BulkDeleteMaxAge = 14 * 24 * 60 * 60 * 1000;

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

  public keyOf(data: CacheEntityTypes["messages"]): string {
    return this.resolveKey(data.channel_id, data.id);
  }

  /**
   * Adds a message to the cache, its author to `client.users` (unless a webhook sent it), and its member to
   * `client.members`.
   *
   * @internal
   */
  public override async _add(
    data: CacheEntityTypes["messages"],
    cache = true,
    options?: AddOptions,
  ): Promise<Message> {
    const { author, member, guild_id: guildId } = data;
    await this.client.users._add(author, cache && !data.webhook_id);
    if (member && guildId) {
      await this.client.members._add({ ...member, user: author, guild_id: guildId }, cache);
    }

    return super._add(data, cache, options);
  }

  public override async hydrate(data: CacheEntityTypes["messages"]): Promise<Message> {
    const { author, member, guild_id: guildId } = data;
    // A webhook is not a user: its author only holds for this message.
    const resolvedAuthor = data.webhook_id
      ? this.client.users.createStructure(author)
      : await this.client.users.resolveData(author);
    const resolvedMember =
      member && guildId
        ? await this.client.members.resolveData({ ...member, user: author, guild_id: guildId })
        : null;
    return new Message(data, { author: resolvedAuthor, member: resolvedMember });
  }

  public resolveKey(channelId: string, messageId: string): string {
    return messageKey(channelId, messageId);
  }

  /**
   * Lists the messages of a channel, newest first, and caches them.
   *
   * @param channelId The ID of the channel.
   * @param options How many messages, and around which one.
   */
  public async list(channelId: string, options: MessageListOptions = {}): Promise<Message[]> {
    const query = new URLSearchParams({ limit: String(options.limit ?? 50) });
    for (const key of ["before", "after", "around"] as const) {
      const value = options[key];
      if (value) query.set(key, value);
    }

    const messages = (await container.rest.get(Routes.channelMessages(channelId), {
      query,
    })) as APIMessage[];
    return Promise.all(messages.map((message) => this.store(message)));
  }

  /**
   * Sends a message to a channel.
   *
   * @param channelId The ID of the channel.
   * @param options The message, or its content.
   */
  public async send(
    channelId: string,
    options: MessagePayloadResolvable<MessageCreateOptions>,
  ): Promise<Message> {
    const { body, files } = resolveMessageOptions(options);
    const message = (await container.rest.post(Routes.channelMessages(channelId), {
      body,
      files,
    })) as APIMessage;
    return this.store(message);
  }

  /**
   * Forwards a message to another channel.
   *
   * @param channelId The ID of the channel of the message.
   * @param messageId The ID of the message.
   * @param targetChannelId The ID of the channel to forward it to.
   */
  public forward(channelId: string, messageId: string, targetChannelId: string): Promise<Message> {
    return this.send(targetChannelId, {
      message_reference: {
        type: MessageReferenceType.Forward,
        channel_id: channelId,
        message_id: messageId,
      },
    });
  }

  /**
   * Edits a message.
   *
   * @param channelId The ID of the channel.
   * @param messageId The ID of the message.
   * @param options The changes, or the new content.
   */
  public async edit(
    channelId: string,
    messageId: string,
    options: MessagePayloadResolvable<MessageEditOptions>,
  ): Promise<Message> {
    const { body, files } = resolveMessageOptions(options);
    const message = (await container.rest.patch(Routes.channelMessage(channelId, messageId), {
      body,
      files,
    })) as APIMessage;
    return this.store(message);
  }

  /**
   * Deletes a message.
   *
   * @param channelId The ID of the channel.
   * @param messageId The ID of the message.
   * @param reason The reason for the audit log, when deleting someone else's message.
   */
  public async delete(channelId: string, messageId: string, reason?: string): Promise<void> {
    await container.rest.delete(Routes.channelMessage(channelId, messageId), { reason });
    await this.cache?.delete(this.resolveKey(channelId, messageId));
  }

  /**
   * Deletes up to 100 messages at once, skipping the ones older than 14 days that Discord refuses.
   *
   * @param channelId The ID of the channel.
   * @param messages The IDs of the messages, or how many of the latest ones to delete.
   * @param filterOld Whether to drop the messages older than 14 days instead of letting the request fail.
   * @returns The IDs of the deleted messages.
   */
  public async bulkDelete(
    channelId: string,
    messages: readonly string[] | number,
    filterOld = false,
  ): Promise<string[]> {
    let ids =
      typeof messages === "number"
        ? (await this.list(channelId, { limit: messages })).map((message) => message.id)
        : [...messages];

    if (filterOld) {
      const oldest = Date.now() - BulkDeleteMaxAge;
      ids = ids.filter((id) => Number((BigInt(id) >> 22n) + 1_420_070_400_000n) > oldest);
    }

    if (ids.length === 0) return [];
    if (ids.length === 1) {
      await this.delete(channelId, ids[0]!);
    } else {
      await container.rest.post(Routes.channelBulkDelete(channelId), {
        body: { messages: ids },
      });
      await Promise.all(ids.map((id) => this.cache?.delete(this.resolveKey(channelId, id))));
    }

    return ids;
  }

  /**
   * Fetches the pinned messages of a channel, most recently pinned first, and caches them.
   *
   * @param channelId The ID of the channel.
   * @param options How many pins to fetch (up to 50), and before which pin time.
   */
  public async fetchPins(
    channelId: string,
    options: { limit?: number; before?: Date | number } = {},
  ): Promise<{ items: PinnedMessage[]; hasMore: boolean }> {
    const query = new URLSearchParams();
    if (options.limit) query.set("limit", String(options.limit));
    if (options.before !== undefined) query.set("before", new Date(options.before).toISOString());

    const result = (await container.rest.get(Routes.channelMessagesPins(channelId), {
      query,
    })) as RESTGetAPIChannelMessagesPinsResult;
    const items = await Promise.all(
      result.items.map(async (item) => ({
        message: await this.store(item.message),
        pinnedTimestamp: Date.parse(item.pinned_at),
      })),
    );
    return { items, hasMore: result.has_more };
  }

  /**
   * Pins a message.
   *
   * @param channelId The ID of the channel.
   * @param messageId The ID of the message.
   * @param reason The reason for the audit log.
   */
  public async pin(channelId: string, messageId: string, reason?: string): Promise<void> {
    await container.rest.put(Routes.channelMessagesPin(channelId, messageId), { reason });
    await this.patchCached(channelId, messageId, { pinned: true });
  }

  /**
   * Unpins a message.
   *
   * @param channelId The ID of the channel.
   * @param messageId The ID of the message.
   * @param reason The reason for the audit log.
   */
  public async unpin(channelId: string, messageId: string, reason?: string): Promise<void> {
    await container.rest.delete(Routes.channelMessagesPin(channelId, messageId), { reason });
    await this.patchCached(channelId, messageId, { pinned: false });
  }

  /**
   * Publishes a message of an announcement channel to the channels following it.
   *
   * @param channelId The ID of the channel.
   * @param messageId The ID of the message.
   */
  public async crosspost(channelId: string, messageId: string): Promise<Message> {
    const message = (await container.rest.post(
      Routes.channelMessageCrosspost(channelId, messageId),
    )) as APIMessage;
    return this.store(message);
  }

  /**
   * Reacts to a message as the bot.
   *
   * @param channelId The ID of the channel.
   * @param messageId The ID of the message.
   * @param emoji The emoji.
   */
  public async react(
    channelId: string,
    messageId: string,
    emoji: EmojiIdentifierResolvable,
  ): Promise<void> {
    await container.rest.put(
      Routes.channelMessageOwnReaction(
        channelId,
        messageId,
        ReactionEmoji.resolveIdentifier(emoji),
      ),
    );
  }

  /**
   * Removes every reaction with one emoji from a message.
   *
   * @param channelId The ID of the channel.
   * @param messageId The ID of the message.
   * @param emoji The emoji.
   */
  public async removeReactionEmoji(
    channelId: string,
    messageId: string,
    emoji: EmojiIdentifierResolvable,
  ): Promise<void> {
    await container.rest.delete(
      Routes.channelMessageReaction(channelId, messageId, ReactionEmoji.resolveIdentifier(emoji)),
    );
  }

  /**
   * Removes every reaction from a message.
   *
   * @param channelId The ID of the channel.
   * @param messageId The ID of the message.
   */
  public async removeAllReactions(channelId: string, messageId: string): Promise<void> {
    await container.rest.delete(Routes.channelMessageAllReactions(channelId, messageId));
    await this.patchCached(channelId, messageId, { reactions: [] });
  }

  /**
   * Starts a thread from a message.
   *
   * @param channelId The ID of the channel.
   * @param messageId The ID of the message.
   * @param options The thread's name and settings.
   */
  public async startThread(
    channelId: string,
    messageId: string,
    options: MessageThreadCreateOptions,
  ): Promise<AnyThreadChannel> {
    const body: RESTPostAPIChannelMessagesThreadsJSONBody = {
      name: options.name,
      auto_archive_duration: options.autoArchiveDuration,
      rate_limit_per_user: options.rateLimitPerUser,
    };
    const thread = (await container.rest.post(Routes.threads(channelId, messageId), {
      body,
      reason: options.reason,
    })) as APIThreadChannel;
    return this.client.threads._add(thread);
  }

  /**
   * Ends a poll now. Only the bot's own polls can be ended.
   *
   * @param channelId The ID of the channel.
   * @param messageId The ID of the message holding the poll.
   */
  public async endPoll(channelId: string, messageId: string): Promise<Message> {
    const message = (await container.rest.post(
      Routes.expirePoll(channelId, messageId),
    )) as APIMessage;
    return this.store(message);
  }

  /**
   * Fetches the users who voted for an answer of a poll, paginated by user ID.
   *
   * @param channelId The ID of the channel.
   * @param messageId The ID of the message holding the poll.
   * @param answerId The ID of the answer.
   * @param options How many voters to fetch (up to 100), and after which user ID.
   */
  public async fetchPollAnswerVoters(
    channelId: string,
    messageId: string,
    answerId: number,
    options: { limit?: number; after?: string } = {},
  ): Promise<User[]> {
    const query = new URLSearchParams();
    if (options.limit) query.set("limit", String(options.limit));
    if (options.after) query.set("after", options.after);
    const { users } = (await container.rest.get(
      Routes.pollAnswerVoters(channelId, messageId, answerId),
      { query },
    )) as RESTGetAPIPollAnswerVotersResult;
    return Promise.all(users.map((user) => this.client.users._add(user)));
  }

  protected async fetchRaw(channelId: string, messageId: string) {
    return (await container.rest.get(Routes.channelMessage(channelId, messageId))) as APIMessage;
  }

  private store(message: APIMessage): Promise<Message> {
    return this._add(message);
  }

  private async patchCached(
    channelId: string,
    messageId: string,
    patch: Partial<CacheEntityTypes["messages"]>,
  ): Promise<void> {
    const key = this.resolveKey(channelId, messageId);
    const cached = await this.cache?.get(key);
    if (cached) await this.cache!.set(key, { ...cached, ...patch });
  }
}
