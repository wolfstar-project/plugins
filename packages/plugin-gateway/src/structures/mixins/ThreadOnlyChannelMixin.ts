import type { ChannelType } from "discord-api-types/v10";
import type { Channel } from "../Channel.js";
import { kData } from "../Structure.js";
import type { APIGuildForumDefaultReactionEmoji, APIGuildForumTag } from "discord-api-types/v10";

type Data = {
  available_tags?: APIGuildForumTag[];
  default_reaction_emoji?: APIGuildForumDefaultReactionEmoji | null;
  default_thread_rate_limit_per_user?: number;
};

export interface ThreadOnlyChannelMixin<
  Type extends ChannelType = ChannelType,
> extends Channel<Type> {}

/**
 * Adds the fields of forum and media channels, which only hold threads.
 */
export class ThreadOnlyChannelMixin<Type extends ChannelType = ChannelType> {
  public get availableTags(): readonly APIGuildForumTag[] {
    return (this[kData] as Data).available_tags ?? [];
  }

  public get defaultReactionEmoji(): APIGuildForumDefaultReactionEmoji | null {
    return (this[kData] as Data).default_reaction_emoji ?? null;
  }

  public get defaultThreadRateLimitPerUser(): number {
    return (this[kData] as Data).default_thread_rate_limit_per_user ?? 0;
  }
}
