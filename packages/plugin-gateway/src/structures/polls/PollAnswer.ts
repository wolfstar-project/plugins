import { PollAnswer as BasePollAnswer } from "@discordjs/structures";
import type { APIPollAnswer } from "discord-api-types/v10";
import { PollAnswerVoterManager } from "../../managers/PollAnswerVoterManager.js";
import { ReactionEmoji } from "../emojis/ReactionEmoji.js";
import { Mixin } from "../Mixin.js";
import type { GuildEmoji } from "../emojis/GuildEmoji.js";
import { initStructure, kData, kRelations, StructureMixin } from "../Structure.js";
import type { Poll } from "./Poll.js";
import type { User } from "../users/User.js";

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
 * The relations of a {@link PollAnswer}: its poll, and its cached custom emoji.
 */
export interface PollAnswerRelations {
  poll?: Poll | null;
  emoji?: GuildEmoji | null;
}

export interface PollAnswer extends StructureMixin<PollAnswerData, PollAnswerRelations> {}

/**
 * An answer of a {@link Poll}: `@discordjs/structures`' `PollAnswer`, with its vote count and the message it belongs to.
 */
export class PollAnswer extends BasePollAnswer {
  /**
   * @param data The raw answer, with its vote count and the message it belongs to.
   * @param relations The related structures, resolved from the cache.
   */
  public constructor(data: PollAnswerData, relations: PollAnswerRelations = {}) {
    super(data);
    initStructure(this, data, relations);
  }

  /**
   * The ID of the answer, an alias of `answerId`.
   */
  public get id() {
    return this.answerId;
  }

  public get channelId() {
    return this[kData].channel_id;
  }

  public get messageId() {
    return this[kData].message_id;
  }

  public get text(): string | null {
    return this[kData].poll_media?.text ?? null;
  }

  /**
   * Whether the answer is partial: its message is not cached, so only its ID is known, see `Partials.PollAnswer`.
   * Fetch its poll to complete it.
   */
  public get partial(): boolean {
    return (
      this[kData].poll_media?.text === undefined && this[kData].poll_media?.emoji === undefined
    );
  }

  /**
   * The poll the answer belongs to, like discord.js's `PollAnswer#poll`: `null` when the answer was not read from a
   * poll.
   */
  public get poll(): Poll | null {
    return this[kRelations].poll ?? null;
  }

  /**
   * The emoji of the answer, like discord.js's `PollAnswer#emoji`: the cached custom emoji of the message's guild,
   * else the payload's.
   */
  public get emoji(): GuildEmoji | ReactionEmoji | null {
    const { emoji } = this[kData].poll_media ?? {};
    return this[kRelations].emoji ?? (emoji?.id || emoji?.name ? new ReactionEmoji(emoji) : null);
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
    return this.voters.fetch(options);
  }

  /**
   * The voters of the answer, like discord.js's `PollAnswer#voters`.
   */
  public get voters(): PollAnswerVoterManager {
    return new PollAnswerVoterManager(this);
  }
}

Mixin(PollAnswer, [StructureMixin]);
