import { Reaction as BaseReaction, Structure as BaseStructure } from "@discordjs/structures";
import type { APIReaction } from "discord-api-types/v10";
import { ReactionUserManager } from "../../managers/ReactionUserManager.js";
import { ReactionEmoji } from "../emojis/ReactionEmoji.js";
import { Mixin } from "../Mixin.js";
import { initStructure, kData, kPatch, StructureMixin } from "../Structure.js";

/**
 * The raw data of a reaction, with the message it belongs to. The counts are absent when the reaction was built from
 * a gateway event on a message the cache did not hold.
 */
export type MessageReactionData = Omit<APIReaction, "count" | "count_details"> &
  Partial<Pick<APIReaction, "count" | "count_details">> & {
    channel_id: string;
    message_id: string;
  };

export interface MessageReaction extends StructureMixin<MessageReactionData> {}

/**
 * A reaction on a message, an emoji, how many users reacted with it, and whether the bot did: `@discordjs/structures`'
 * `Reaction`, with the message it belongs to, its users, and actions through the client.
 *
 * @remarks
 * The counts are omitted from `@discordjs/structures`' data type, since a reaction built from a gateway event on an
 * uncached message has none.
 */
export class MessageReaction extends BaseReaction<"count" | "count_details"> {
  /**
   * Keeps the raw `burst_colors`, which `@discordjs/structures` strips and re-serializes, so that
   * {@link MessageReaction.toJSON} returns the reaction as received.
   */
  public static override DataTemplate: Partial<APIReaction> = {};

  /**
   * @param data The raw reaction, with the message it belongs to.
   * @param relations The related structures, resolved from the cache.
   */
  public constructor(data: MessageReactionData, relations: object = {}) {
    super(data);
    initStructure(this, data, relations);
  }

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
  public override get count(): number | null {
    return this[kData].count ?? null;
  }

  /**
   * How many normal and super (burst) reactions there are; `null` when unknown.
   */
  public get countDetails(): { normal: number; burst: number } | null {
    return this[kData].count_details ?? null;
  }

  /**
   * The colors of the super reaction animation, as numbers.
   */
  public override get burstColors(): number[] {
    // `@discordjs/structures` parses the raw `#rrggbb` strings with their leading hash, which yields `NaN`.
    return this[kData].burst_colors.map((color) => Number.parseInt(color.replace(/^#/, ""), 16));
  }

  /**
   * The users who reacted.
   */
  public get users(): ReactionUserManager {
    return new ReactionUserManager(
      this.client,
      this.channelId,
      this.messageId,
      this.emoji.identifier,
    );
  }

  /**
   * Reacts with this emoji as the bot.
   */
  public async react(): Promise<this> {
    await this.client.messages.react(this.channelId, this.messageId, this.emoji.identifier);
    return this[kPatch]({ me: true });
  }

  /**
   * Removes every reaction with this emoji.
   */
  public async remove(): Promise<this> {
    await this.client.messages.removeReactionEmoji(
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
    const message = await this.client.messages.fetch(this.channelId, this.messageId, {
      force: true,
    });
    const identifier = this.emoji.identifier;
    const current = message.reactions.cache.find(
      (reaction) => reaction.emoji.identifier === identifier,
    );
    return current
      ? this[kPatch](current.toJSON())
      : this[kPatch]({
          count: 0,
          count_details: { normal: 0, burst: 0 },
          me: false,
          me_burst: false,
          burst_colors: [],
        });
  }

  public valueOf(): string {
    return this.emoji.id ?? this.emoji.name ?? "";
  }

  /**
   * Transforms this reaction into its raw data, as received.
   *
   * @remarks
   * Typed as `@discordjs/structures`' `APIReaction`, but the counts are absent when they are unknown, and the data
   * carries the IDs of the channel and the message.
   */
  public override toJSON(): APIReaction {
    return BaseStructure.prototype.toJSON.call(this) as APIReaction;
  }
}

Mixin(MessageReaction, [StructureMixin]);
