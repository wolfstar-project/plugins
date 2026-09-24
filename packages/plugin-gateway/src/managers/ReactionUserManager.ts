import { Routes, type APIUser, type ReactionType } from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import { type User } from "../structures/User.js";
import { container } from "../util/container.js";

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
    const query = new URLSearchParams({ limit: String(options.limit ?? 100) });
    if (options.after) query.set("after", options.after);
    if (options.type !== undefined) query.set("type", String(options.type));

    const users = (await container.rest.get(
      Routes.channelMessageReaction(this.channelId, this.messageId, this.emoji),
      { query },
    )) as APIUser[];
    return Promise.all(users.map((user) => this.client.users._add(user)));
  }

  /**
   * Removes a user's reaction, the bot's by default.
   *
   * @param userId The ID of the user, `"@me"` for the bot.
   */
  public async remove(userId = "@me"): Promise<void> {
    await container.rest.delete(
      userId === "@me" || userId === this.client.user?.id
        ? Routes.channelMessageOwnReaction(this.channelId, this.messageId, this.emoji)
        : Routes.channelMessageUserReaction(this.channelId, this.messageId, this.emoji, userId),
    );
  }
}
