import type { APIPartialEmoji, APIReaction } from "discord-api-types/v10";
import {
  ReactionEmoji,
  type EmojiIdentifierResolvable,
} from "../structures/emojis/ReactionEmoji.js";

/**
 * Builds the test telling whether a reaction's emoji is the one something {@link EmojiIdentifierResolvable}
 * identifies: custom emojis match by ID, whatever their name or animated flag, Unicode ones by name.
 *
 * @param emoji The emoji to look for.
 * @internal
 */
export function reactionEmojiMatcher(
  emoji: EmojiIdentifierResolvable,
): (candidate: APIPartialEmoji) => boolean {
  const { id, name } = ReactionEmoji.resolvePartial(emoji);
  const identifier = ReactionEmoji.resolveIdentifier(emoji);
  return (candidate) =>
    id
      ? candidate.id === id
      : !candidate.id &&
        Boolean(candidate.name) &&
        (candidate.name === name || ReactionEmoji.resolveIdentifier(candidate) === identifier);
}

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
  const matches = reactionEmojiMatcher(emoji);
  const existing = current.find((reaction) => matches(reaction.emoji));

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
