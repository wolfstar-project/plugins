import type { APIReaction } from "discord-api-types/v10";
import {
  ReactionEmoji,
  type EmojiIdentifierResolvable,
} from "../structures/emojis/ReactionEmoji.js";

/**
 * Adds the bot's own, normal reaction to the raw reactions of a message, as the API counts it once the reaction route
 * answers: what discord.js's `MessageReactionAdd` action does for `Message#react`.
 *
 * @param reactions The raw reactions of the message.
 * @param emoji The emoji the bot reacted with.
 * @returns The updated reactions, or the very same array when the bot had already reacted with the emoji.
 * @internal
 */
export function withOwnReaction(
  reactions: readonly APIReaction[] | undefined,
  emoji: EmojiIdentifierResolvable,
): APIReaction[] {
  const current = (reactions ?? []) as APIReaction[];
  const { id, name, animated } = ReactionEmoji.resolvePartial(emoji);
  const existing = current.find((reaction) =>
    id ? reaction.emoji.id === id : !reaction.emoji.id && reaction.emoji.name === name,
  );

  if (!existing) {
    return [
      ...current,
      {
        emoji: id ? { id, name, animated } : { id: null, name },
        count: 1,
        count_details: { normal: 1, burst: 0 },
        me: true,
        me_burst: false,
        burst_colors: [],
      },
    ];
  }

  if (existing.me) return current;
  return current.map((reaction) =>
    reaction === existing
      ? {
          ...reaction,
          count: reaction.count + 1,
          count_details: {
            normal: (reaction.count_details?.normal ?? 0) + 1,
            burst: reaction.count_details?.burst ?? 0,
          },
          me: true,
        }
      : reaction,
  );
}
