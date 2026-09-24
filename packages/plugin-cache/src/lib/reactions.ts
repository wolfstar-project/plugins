import type {
  APIMessage,
  APIPartialEmoji,
  APIReaction,
  GatewayMessagePollVoteDispatchData,
  GatewayMessageReactionAddDispatchData,
  GatewayMessageReactionRemoveDispatchData,
} from "discord-api-types/v10";

// Reactions and poll votes only carry the voter's ID, so whether the bot is the voter needs the bot's own ID.

/**
 * Whether two reaction emojis are the same: custom emojis match by ID, Unicode emojis by name.
 */
function isSameEmoji(a: APIPartialEmoji, b: APIPartialEmoji): boolean {
  return a.id ? a.id === b.id : !b.id && a.name === b.name;
}

/**
 * Adds a `MESSAGE_REACTION_ADD` to a cached message's reactions.
 *
 * @param message The cached message.
 * @param data The dispatch data.
 * @param clientUserId The bot's user ID, to set `me` when the bot reacted.
 */
export function addReaction(
  message: APIMessage,
  data: GatewayMessageReactionAddDispatchData,
  clientUserId?: string,
): APIMessage {
  const me = data.user_id === clientUserId;
  const kind = data.burst ? "burst" : "normal";
  const reactions = message.reactions ?? [];
  const existing = reactions.find((reaction) => isSameEmoji(reaction.emoji, data.emoji));

  if (!existing) {
    const reaction: APIReaction = {
      emoji: data.emoji,
      count: 1,
      count_details: { normal: data.burst ? 0 : 1, burst: data.burst ? 1 : 0 },
      me: me && !data.burst,
      me_burst: me && data.burst,
      burst_colors: data.burst_colors ?? [],
    };
    return { ...message, reactions: [...reactions, reaction] };
  }

  return {
    ...message,
    reactions: reactions.map((reaction) =>
      reaction === existing
        ? {
            ...reaction,
            count: reaction.count + 1,
            count_details: {
              ...reaction.count_details,
              [kind]: reaction.count_details[kind] + 1,
            },
            me: reaction.me || (me && !data.burst),
            me_burst: reaction.me_burst || (me && data.burst),
            burst_colors: data.burst
              ? (data.burst_colors ?? reaction.burst_colors)
              : reaction.burst_colors,
          }
        : reaction,
    ),
  };
}

/**
 * Removes a `MESSAGE_REACTION_REMOVE` from a cached message's reactions, dropping the reaction when its count reaches
 * zero.
 *
 * @param message The cached message.
 * @param data The dispatch data.
 * @param clientUserId The bot's user ID, to clear `me` when the bot's reaction was removed.
 */
export function removeReaction(
  message: APIMessage,
  data: GatewayMessageReactionRemoveDispatchData,
  clientUserId?: string,
): APIMessage {
  const me = data.user_id === clientUserId;
  const kind = data.burst ? "burst" : "normal";
  const reactions = (message.reactions ?? []).flatMap((reaction) => {
    if (!isSameEmoji(reaction.emoji, data.emoji)) return [reaction];
    if (reaction.count <= 1) return [];
    return [
      {
        ...reaction,
        count: reaction.count - 1,
        count_details: {
          ...reaction.count_details,
          [kind]: Math.max(0, reaction.count_details[kind] - 1),
        },
        me: reaction.me && !(me && !data.burst),
        me_burst: reaction.me_burst && !(me && data.burst),
      },
    ];
  });
  return { ...message, reactions };
}

/**
 * Removes every reaction with one emoji from a cached message.
 *
 * @param message The cached message.
 * @param emoji The emoji.
 */
export function removeReactionEmoji(message: APIMessage, emoji: APIPartialEmoji): APIMessage {
  return {
    ...message,
    reactions: (message.reactions ?? []).filter((reaction) => !isSameEmoji(reaction.emoji, emoji)),
  };
}

/**
 * Counts a `MESSAGE_POLL_VOTE_ADD` or `MESSAGE_POLL_VOTE_REMOVE` in a cached message's poll results.
 *
 * @param message The cached message.
 * @param data The dispatch data.
 * @param delta `1` for a vote, `-1` for a removed vote.
 * @param clientUserId The bot's user ID, to set `me_voted` when the bot voted.
 */
export function countPollVote(
  message: APIMessage,
  data: GatewayMessagePollVoteDispatchData,
  delta: 1 | -1,
  clientUserId?: string,
): APIMessage {
  const { poll } = message;
  if (!poll) return message;

  const me = data.user_id === clientUserId;
  const results = poll.results ?? { is_finalized: false, answer_counts: [] };
  const counts = results.answer_counts.some((count) => count.id === data.answer_id)
    ? results.answer_counts
    : [...results.answer_counts, { id: data.answer_id, count: 0, me_voted: false }];

  return {
    ...message,
    poll: {
      ...poll,
      results: {
        ...results,
        answer_counts: counts.map((count) =>
          count.id === data.answer_id
            ? {
                ...count,
                count: Math.max(0, count.count + delta),
                me_voted: me ? delta === 1 : count.me_voted,
              }
            : count,
        ),
      },
    },
  };
}
