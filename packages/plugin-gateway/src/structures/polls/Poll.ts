import { Poll as BasePoll, Structure as BaseStructure } from "@discordjs/structures";
import type { APIPoll } from "discord-api-types/v10";
import type { Message } from "../messages/Message.js";
import { PollAnswer } from "./PollAnswer.js";
import { ReactionEmoji } from "../emojis/ReactionEmoji.js";
import { Mixin } from "../Mixin.js";
import type { AnyChannel } from "../../managers/ChannelManager.js";
import type { GuildEmoji } from "../emojis/GuildEmoji.js";
import {
  bindClient,
  initStructure,
  kData,
  kPatch,
  kRelations,
  StructureMixin,
} from "../Structure.js";

/**
 * The raw data of a poll, with the message it belongs to.
 */
export type PollData = APIPoll & { channel_id: string; message_id: string };

/**
 * The relations of a {@link Poll}: the message it belongs to, and that message's channel and cached custom emojis.
 */
export interface PollRelations {
  message?: Message | null;
  channel?: AnyChannel | null;
  /**
   * The cached custom emojis of the answers, by ID, when they belong to the message's guild.
   */
  emojis?: ReadonlyMap<string, GuildEmoji>;
}

export interface Poll extends StructureMixin<PollData, PollRelations> {}

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
  public constructor(data: PollData, relations: PollRelations = {}) {
    super(data);
    initStructure(this, data, relations);
  }

  public get channelId() {
    return this[kData].channel_id;
  }

  public get messageId() {
    return this[kData].message_id;
  }

  /**
   * The message the poll belongs to, like discord.js's `Poll#message`: `null` when the poll was not read from a
   * message.
   */
  public get message(): Message | null {
    return this[kRelations].message ?? null;
  }

  /**
   * The channel of the poll's message, from the cache, like discord.js's `Poll#channel`.
   */
  public get channel(): AnyChannel | null {
    return this[kRelations].channel ?? null;
  }

  /**
   * Whether the poll is partial: built from its message's IDs alone for a vote on an uncached message, see
   * `Partials.Poll`. Only `channelId` and `messageId` are reliable then, and {@link Poll.fetch} completes it.
   */
  public get partial(): boolean {
    return this[kData].question === undefined;
  }

  /**
   * Fetches the poll's message from the API and patches this structure with its poll.
   */
  public async fetch(): Promise<this> {
    const message = await this.client.messages.fetch(this.channelId, this.messageId, {
      force: true,
    });
    const { poll } = message.toJSON();
    if (!poll) throw new Error(`Message ${this.messageId} has no poll`);
    return this[kPatch](poll as Partial<PollData>);
  }

  public get question(): { text: string | null; emoji: ReactionEmoji | null } {
    const { text, emoji } = this[kData].question ?? {};
    return { text: text ?? null, emoji: emoji ? new ReactionEmoji(emoji) : null };
  }

  /**
   * The answers, with their vote counts when Discord sent the results.
   */
  public get answers(): PollAnswer[] {
    const counts = new Map(
      (this[kData].results?.answer_counts ?? []).map((count) => [count.id, count]),
    );
    return (this[kData].answers ?? []).map((answer) => {
      const count = counts.get(answer.answer_id);
      const emojiId = answer.poll_media.emoji?.id;
      const relations = {
        poll: this,
        emoji: (emojiId && this[kRelations].emojis?.get(emojiId)) || null,
      };
      return bindClient(
        new PollAnswer(
          {
            ...answer,
            channel_id: this.channelId,
            message_id: this.messageId,
            count: count?.count,
            me_voted: count?.me_voted,
          },
          relations,
        ),
        this.client,
      );
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
