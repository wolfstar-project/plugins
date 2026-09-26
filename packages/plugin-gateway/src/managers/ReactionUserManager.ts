import type { ReactionType } from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import { type User } from "../structures/User.js";

/**
 * Manages the users who reacted to a message with one emoji.
 */
export class ReactionUserManager {
  public readonly client: GatewayClient;
  public readonly channelId: string;
  public readonly messageId: string;
  /**
   * The emoji, as the identifier reaction routes expect (`name:id` or the encoded Unicode emoji).
   */
  public readonly emoji: string;

  public constructor(client: GatewayClient, channelId: string, messageId: string, emoji: string) {
    this.client = client;
    this.channelId = channelId;
    this.messageId = messageId;
    this.emoji = emoji;
  }

  /**
   * Fetches the users who reacted, paginated by user ID, and caches them.
   *
   * @param options How many users to fetch (up to 100), after which user ID, and which kind of reaction.
   */
  public async fetch(
    options: { limit?: number; after?: string; type?: ReactionType } = {},
  ): Promise<User[]> {
    const users = await this.client.core.api.channels.getMessageReactions(
      this.channelId,
      this.messageId,
      this.emoji,
      { limit: options.limit ?? 100, after: options.after, type: options.type },
    );
    return Promise.all(users.map((user) => this.client.users._add(user)));
  }

  /**
   * Removes a user's reaction, the bot's by default.
   *
   * @param userId The ID of the user, `"@me"` for the bot.
   */
  public async remove(userId = "@me"): Promise<void> {
    if (userId === "@me" || userId === this.client.user?.id) {
      await this.client.core.api.channels.deleteOwnMessageReaction(
        this.channelId,
        this.messageId,
        this.emoji,
      );
    } else {
      await this.client.core.api.channels.deleteUserMessageReaction(
        this.channelId,
        this.messageId,
        this.emoji,
        userId,
      );
    }
  }
}
