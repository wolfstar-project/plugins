import type { APIPollAnswer } from "discord-api-types/v10";
import { getGatewayClient } from "../util/container.js";
import { ReactionEmoji } from "./ReactionEmoji.js";
import { kData, Structure } from "./Structure.js";
import type { User } from "./User.js";

/**
 * The raw data of a poll answer, with its vote count from the poll's results and the message it belongs to.
 */
export type PollAnswerData = APIPollAnswer & {
  channel_id: string;
  message_id: string;
  /**
   * The vote count from the poll's results, absent when Discord did not send them.
   */
  count?: number;
  me_voted?: boolean;
};

/**
 * An answer of a {@link Poll}.
 */
export class PollAnswer extends Structure<PollAnswerData> {
  public get id() {
    return this[kData].answer_id;
  }

  public get channelId() {
    return this[kData].channel_id;
  }

  public get messageId() {
    return this[kData].message_id;
  }

  public get text(): string | null {
    return this[kData].poll_media.text ?? null;
  }

  public get emoji(): ReactionEmoji | null {
    const { emoji } = this[kData].poll_media;
    return emoji ? new ReactionEmoji(emoji) : null;
  }

  /**
   * How many users voted for the answer, `0` when the results are unknown.
   */
  public get voteCount(): number {
    return this[kData].count ?? 0;
  }

  /**
   * Whether the bot voted for the answer.
   */
  public get meVoted(): boolean {
    return this[kData].me_voted ?? false;
  }

  /**
   * Fetches the users who voted for the answer, paginated by user ID.
   *
   * @param options How many voters to fetch (up to 100), and after which user ID.
   */
  public fetchVoters(options: { limit?: number; after?: string } = {}): Promise<User[]> {
    return getGatewayClient().messages.fetchPollAnswerVoters(
      this.channelId,
      this.messageId,
      this.id,
      options,
    );
  }
}
