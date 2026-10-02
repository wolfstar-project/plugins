import { Collection } from "@discordjs/collection";
import type { APIReaction } from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import type { GuildEmoji } from "../structures/emojis/GuildEmoji.js";
import type { Message } from "../structures/messages/Message.js";
import { bindClient } from "../structures/Structure.js";
import { MessageReaction } from "../structures/messages/MessageReaction.js";
import {
  ReactionEmoji,
  type EmojiIdentifierResolvable,
} from "../structures/emojis/ReactionEmoji.js";
import { BaseManager } from "./BaseManager.js";

/**
 * Manages the reactions of one message, as they were in the message's payload.
 */
export class ReactionManager extends BaseManager {
  public readonly channelId: string;
  public readonly messageId: string;

  readonly #reactions: readonly APIReaction[];

  readonly #message: Message | null;

  readonly #emojis: ReadonlyMap<string, GuildEmoji> | undefined;

  /**
   * @param client The client.
   * @param channelId The ID of the channel of the message.
   * @param messageId The ID of the message.
   * @param reactions The raw reactions of the message.
   * @param message The message, which its reactions refer to.
   * @param emojis The cached custom emojis of the reactions, by ID.
   */
  public constructor(
    client: GatewayClient,
    channelId: string,
    messageId: string,
    reactions: readonly APIReaction[],
    message: Message | null = null,
    emojis?: ReadonlyMap<string, GuildEmoji>,
  ) {
    super(client);
    this.channelId = channelId;
    this.messageId = messageId;
    this.#reactions = reactions;
    this.#message = message;
    this.#emojis = emojis;
  }

  /**
   * The reactions of the message, by emoji like discord.js's `ReactionManager#cache`: the ID of a custom emoji, the
   * name of a Unicode one.
   */
  public get cache(): Collection<string, MessageReaction> {
    return new Collection(
      this.#reactions.map((reaction) => {
        const structure = bindClient(
          new MessageReaction(
            { ...reaction, channel_id: this.channelId, message_id: this.messageId },
            {
              message: this.#message,
              emoji: (reaction.emoji.id && this.#emojis?.get(reaction.emoji.id)) || null,
            },
          ),
          this.client,
        );
        return [structure.valueOf(), structure];
      }),
    );
  }

  /**
   * Finds the reaction with an emoji, if the message has it.
   *
   * @param emoji The emoji.
   */
  public resolve(emoji: EmojiIdentifierResolvable): MessageReaction | null {
    const identifier = ReactionEmoji.resolveIdentifier(emoji);
    return (
      this.cache.find(
        (reaction) => ReactionEmoji.resolveIdentifier(reaction.toJSON().emoji) === identifier,
      ) ?? null
    );
  }

  /**
   * Removes every reaction of the message.
   */
  public removeAll(): Promise<void> {
    return this.client.messages.removeAllReactions(this.channelId, this.messageId);
  }
}
