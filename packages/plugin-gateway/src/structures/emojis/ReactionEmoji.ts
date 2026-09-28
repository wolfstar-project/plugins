import type { APIPartialEmoji } from "discord-api-types/v10";
import { Emoji } from "./Emoji.js";
import { GatewayTypeError } from "../../errors/GatewayError.js";
import { resolvePartialEmoji } from "../../util/Util.js";

/**
 * Anything identifying an emoji: a Unicode emoji, a custom emoji mention (`<a:name:id>`), a `name:id` pair, a bare
 * emoji ID, or any object carrying `id`/`name`/`animated` (an {@link Emoji}, a raw `APIPartialEmoji`, ...).
 */
export type EmojiIdentifierResolvable =
  | string
  | { id?: string | null; name?: string | null; animated?: boolean | null };

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
    if (emoji === "") throw new GatewayTypeError("EmojiEmpty");

    const partial = resolvePartialEmoji(emoji);
    if (!partial) {
      // A string with a colon that is no custom emoji: let the API decide.
      if (typeof emoji === "string") {
        return encodeURIComponent(emoji.includes("%") ? decodeURIComponent(emoji) : emoji);
      }
      throw new GatewayTypeError("EmojiType");
    }

    if (!("name" in partial)) return `_:${partial.id}`;
    if (partial.id) return `${partial.animated ? "a:" : ""}${partial.name}:${partial.id}`;
    return encodeURIComponent(partial.name);
  }

  /**
   * Resolves anything {@link EmojiIdentifierResolvable} to the ID and name pair of welcome screens and onboarding.
   *
   * @param emoji The emoji to resolve.
   */
  public static resolvePartial(emoji: EmojiIdentifierResolvable): {
    id: string | null;
    name: string | null;
    animated: boolean;
  } {
    const partial = resolvePartialEmoji(emoji);
    if (!partial)
      return { id: null, name: typeof emoji === "string" ? emoji : null, animated: false };
    if (!("name" in partial)) return { id: partial.id, name: null, animated: false };
    return { id: partial.id ?? null, name: partial.name, animated: partial.animated };
  }
}
