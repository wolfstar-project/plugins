import type { APIReaction } from "discord-api-types/v10";
import { ReactionUserManager } from "../managers/ReactionUserManager.js";
import { getGatewayClient } from "../util/container.js";
import { ReactionEmoji } from "./ReactionEmoji.js";
import { kData, kPatch, Structure } from "./Structure.js";

/**
 * The raw data of a reaction, with the message it belongs to. The counts are absent when the reaction was built from
 * a gateway event on a message the cache did not hold.
 */
export type MessageReactionData = Omit<APIReaction, "count" | "count_details"> &
  Partial<Pick<APIReaction, "count" | "count_details">> & {
    channel_id: string;
    message_id: string;
  };

/**
 * A reaction on a message: an emoji, how many users reacted with it, and whether the bot did.
 */
export class MessageReaction extends Structure<MessageReactionData> {
  public get channelId() {
    return this[kData].channel_id;
  }

  public get messageId() {
    return this[kData].message_id;
  }

  public get emoji(): ReactionEmoji {
    return new ReactionEmoji(this[kData].emoji);
  }

  /**
   * How many users reacted, super reactions included; `null` when unknown.
   */
  public get count(): number | null {
    return this[kData].count ?? null;
  }

  /**
   * How many normal and super (burst) reactions there are; `null` when unknown.
   */
  public get countDetails(): { normal: number; burst: number } | null {
    return this[kData].count_details ?? null;
  }

  /**
   * Whether the bot reacted with a normal reaction.
   */
  public get me(): boolean {
    return this[kData].me;
  }

  /**
   * Whether the bot reacted with a super reaction.
   */
  public get meBurst(): boolean {
    return this[kData].me_burst;
  }

  /**
   * The colors of the super reaction animation, as `#rrggbb` strings.
   */
  public get burstColors(): readonly string[] {
    return this[kData].burst_colors;
  }

  /**
   * The users who reacted.
   */
  public get users(): ReactionUserManager {
    return new ReactionUserManager(
      getGatewayClient(),
      this.channelId,
      this.messageId,
      this.emoji.identifier,
    );
  }

  /**
   * Reacts with this emoji as the bot.
   */
  public async react(): Promise<this> {
    await getGatewayClient().messages.react(this.channelId, this.messageId, this.emoji.identifier);
    return this[kPatch]({ me: true });
  }

  /**
   * Removes every reaction with this emoji.
   */
  public async remove(): Promise<this> {
    await getGatewayClient().messages.removeReactionEmoji(
      this.channelId,
      this.messageId,
      this.emoji.identifier,
    );
    return this;
  }

  /**
   * Fetches the message and patches this reaction with its current counts.
   */
  public async fetch(): Promise<this> {
    const message = await getGatewayClient().messages.fetch(this.channelId, this.messageId, {
      force: true,
    });
    const identifier = this.emoji.identifier;
    const current = message.reactions.cache.find(
      (reaction) => reaction.emoji.identifier === identifier,
    );
    return current ? this[kPatch](current.toJSON()) : this[kPatch]({ count: 0, me: false });
  }

  public valueOf(): string {
    return this.emoji.id ?? this.emoji.name ?? "";
  }
}
