import { FormattingPatterns, type APIPartialEmoji } from "discord-api-types/v10";
import { Emoji } from "./Emoji.js";

/**
 * Anything identifying an emoji: a Unicode emoji, a custom emoji mention (`<a:name:id>`), a `name:id` pair, a bare
 * emoji ID, or any object carrying `id`/`name`/`animated` (an {@link Emoji}, a raw `APIPartialEmoji`, ...).
 */
export type EmojiIdentifierResolvable =
  | string
  | { id?: string | null; name?: string | null; animated?: boolean | null };

/**
 * Matches a `name:id` or `a:name:id` pair without the mention brackets.
 */
const CustomEmojiPattern = /^(?:(?<animated>a):)?(?<name>\w{2,32}):(?<id>\d{17,20})$/;

/**
 * The emoji of a reaction or of a poll answer: a Unicode emoji, or a custom one known only by its ID and name.
 */
export class ReactionEmoji extends Emoji<APIPartialEmoji> {
  /**
   * Resolves anything {@link EmojiIdentifierResolvable} to the identifier reaction routes expect.
   *
   * @param emoji The emoji to resolve.
   * @throws A `TypeError` when the value identifies no emoji.
   */
  public static resolveIdentifier(emoji: EmojiIdentifierResolvable): string {
    if (typeof emoji === "string") {
      const decoded = emoji.includes("%") ? decodeURIComponent(emoji) : emoji;
      if (/^\d{17,20}$/.test(decoded)) return `_:${decoded}`;

      const custom = FormattingPatterns.Emoji.exec(decoded) ?? CustomEmojiPattern.exec(decoded);
      if (custom?.groups) {
        const { animated, name, id } = custom.groups;
        return `${animated ? "a:" : ""}${name}:${id}`;
      }

      if (!decoded) throw new TypeError("Cannot resolve an empty string to an emoji");
      return encodeURIComponent(decoded);
    }

    const { id, name, animated } = emoji;
    if (id) return `${animated ? "a:" : ""}${name ?? "_"}:${id}`;
    if (name) return encodeURIComponent(name);
    throw new TypeError("Cannot resolve an emoji without an ID nor a name");
  }
}
