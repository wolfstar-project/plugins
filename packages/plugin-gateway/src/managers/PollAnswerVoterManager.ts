import type { PollAnswer } from "../structures/polls/PollAnswer.js";
import type { User } from "../structures/users/User.js";
import { BaseManager } from "./BaseManager.js";

/**
 * Manages the voters of one {@link PollAnswer}, like discord.js's `PollAnswerVoterManager`.
 *
 * @remarks
 * Unlike discord.js's, it has no `cache`: the voters of an answer are not tracked, so {@link PollAnswerVoterManager.fetch}
 * reads them from the API each time (and caches the users).
 */
export class PollAnswerVoterManager extends BaseManager {
  /**
   * The answer these voters voted for.
   */
  public readonly answer: PollAnswer;

  /**
   * @param answer The answer.
   */
  public constructor(answer: PollAnswer) {
    super(answer.client);
    this.answer = answer;
  }

  /**
   * Fetches the users that voted for the answer.
   *
   * @param options How many voters to fetch (up to 100), and after which user ID.
   */
  public fetch(options: { limit?: number; after?: string } = {}): Promise<User[]> {
    const { channelId, messageId, answerId } = this.answer;
    return this.client.messages.fetchPollAnswerVoters(channelId, messageId, answerId, options);
  }
}
