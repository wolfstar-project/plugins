import type { APIReaction } from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import { MessageReaction } from "../structures/MessageReaction.js";
import { ReactionEmoji, type EmojiIdentifierResolvable } from "../structures/ReactionEmoji.js";

/**
 * Manages the reactions of one message, as they were in the message's payload.
 */
export class ReactionManager {
  public readonly client: GatewayClient;
  public readonly channelId: string;
  public readonly messageId: string;

  readonly #reactions: readonly APIReaction[];

  public constructor(
    client: GatewayClient,
    channelId: string,
    messageId: string,
    reactions: readonly APIReaction[],
  ) {
    this.client = client;
    this.channelId = channelId;
    this.messageId = messageId;
    this.#reactions = reactions;
  }

  /**
   * The reactions of the message.
   */
  public get cache(): MessageReaction[] {
    return this.#reactions.map(
      (reaction) =>
        new MessageReaction({
          ...reaction,
          channel_id: this.channelId,
          message_id: this.messageId,
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
    return this.cache.find((reaction) => reaction.emoji.identifier === identifier) ?? null;
  }

  /**
   * Removes every reaction of the message.
   */
  public removeAll(): Promise<void> {
    return this.client.messages.removeAllReactions(this.channelId, this.messageId);
  }
}
