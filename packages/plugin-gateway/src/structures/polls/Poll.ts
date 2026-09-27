import { Poll as BasePoll, Structure as BaseStructure } from "@discordjs/structures";
import type { APIPoll } from "discord-api-types/v10";
import type { Message } from "../messages/Message.js";
import { PollAnswer } from "./PollAnswer.js";
import { ReactionEmoji } from "../emojis/ReactionEmoji.js";
import { Mixin } from "../Mixin.js";
import { initStructure, kData, StructureMixin } from "../Structure.js";

/**
 * The raw data of a poll, with the message it belongs to.
 */
export type PollData = APIPoll & { channel_id: string; message_id: string };

export interface Poll extends StructureMixin<PollData> {}

/**
 * The poll of a message: `@discordjs/structures`' `Poll`, with its answers, results, and the message it belongs to.
 */
export class Poll extends BasePoll<""> {
  /**
   * Keeps the raw `expiry`, which `@discordjs/structures` strips and re-serializes in its own format, so that
   * {@link Poll.toJSON} returns the poll as received.
   */
  public static override DataTemplate: Partial<APIPoll> = {};

  /**
   * @param data The raw poll, with the message it belongs to.
   * @param relations The related structures, resolved from the cache.
   */
  public constructor(data: PollData, relations: object = {}) {
    super(data);
    initStructure(this, data, relations);
  }

  public get channelId() {
    return this[kData].channel_id;
  }

  public get messageId() {
    return this[kData].message_id;
  }

  public get question(): { text: string | null; emoji: ReactionEmoji | null } {
    const { text, emoji } = this[kData].question;
    return { text: text ?? null, emoji: emoji ? new ReactionEmoji(emoji) : null };
  }

  /**
   * The answers, with their vote counts when Discord sent the results.
   */
  public get answers(): PollAnswer[] {
    const counts = new Map(
      (this[kData].results?.answer_counts ?? []).map((count) => [count.id, count]),
    );
    return this[kData].answers.map((answer) => {
      const count = counts.get(answer.answer_id);
      return new PollAnswer({
        ...answer,
        channel_id: this.channelId,
        message_id: this.messageId,
        count: count?.count,
        me_voted: count?.me_voted,
      });
    });
  }

  /**
   * Whether the votes are final, i.e. the poll ended and Discord counted them.
   */
  public get resultsFinalized(): boolean {
    return this[kData].results?.is_finalized ?? false;
  }

  /**
   * When the poll ends, `null` for polls that never do.
   */
  public get expiresAt(): Date | null {
    return this.expiresDate;
  }

  /**
   * Ends the poll now. Only the bot's own polls can be ended.
   *
   * @returns The message holding the ended poll.
   */
  public end(): Promise<Message> {
    return this.client.messages.endPoll(this.channelId, this.messageId);
  }

  public override toJSON(): PollData {
    return BaseStructure.prototype.toJSON.call(this) as PollData;
  }
}

Mixin(Poll, [StructureMixin]);
