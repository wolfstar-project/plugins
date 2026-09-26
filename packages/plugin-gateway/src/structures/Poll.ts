import type { APIPoll } from "discord-api-types/v10";
import { getGatewayClient } from "../util/container.js";
import type { Message } from "./Message.js";
import { PollAnswer } from "./PollAnswer.js";
import { ReactionEmoji } from "./ReactionEmoji.js";
import { kData, Structure } from "./Structure.js";

/**
 * The raw data of a poll, with the message it belongs to.
 */
export type PollData = APIPoll & { channel_id: string; message_id: string };

/**
 * The poll of a message.
 */
export class Poll extends Structure<PollData> {
  protected override optimizeData(data: Partial<PollData>): void {
    this.optimizeTimestamp("expiry", data.expiry);
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

  public get allowMultiselect() {
    return this[kData].allow_multiselect;
  }

  public get layoutType() {
    return this[kData].layout_type;
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
  public get expiresTimestamp(): number | null {
    return this.optimizedTimestamp("expiry");
  }

  public get expiresAt(): Date | null {
    const { expiresTimestamp } = this;
    return expiresTimestamp === null ? null : new Date(expiresTimestamp);
  }

  /**
   * Ends the poll now. Only the bot's own polls can be ended.
   *
   * @returns The message holding the ended poll.
   */
  public end(): Promise<Message> {
    return getGatewayClient().messages.endPoll(this.channelId, this.messageId);
  }
}
