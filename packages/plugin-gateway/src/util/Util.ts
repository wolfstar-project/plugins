import { FormattingPatterns, type Snowflake } from "discord-api-types/v10";
import type { EmojiIdentifierResolvable } from "../structures/emojis/ReactionEmoji.js";
import type { ColorResolvable } from "../types.js";
import { Colors } from "./Colors.js";

/**
 * An emoji parsed from a string: a Unicode emoji has no `id`.
 */
export interface PartialEmoji {
  animated: boolean;
  name: string;
  id: Snowflake | undefined;
}

/**
 * An emoji known only by its ID.
 */
export interface PartialEmojiOnlyId {
  id: Snowflake;
}

/**
 * Matches a `name:id` or `a:name:id` pair without the mention brackets.
 */
const CustomEmojiPattern = /^(?:(?<animated>a):)?(?<name>\w{2,32}):(?<id>\d{17,20})$/;

/**
 * Matches an emoji ID.
 */
const SnowflakePattern = /^\d{17,20}$/;

/**
 * Parses an emoji out of a string: a Unicode emoji (URL-encoded or not), a custom emoji mention (`<a:name:id>`), or a
 * `name:id` pair.
 *
 * @param text The string to parse.
 * @returns The emoji, or `null` when the string holds a colon but no custom emoji.
 */
export function parseEmoji(text: string): PartialEmoji | null {
  const decoded = text.includes("%") ? decodeURIComponent(text) : text;
  if (!decoded.includes(":")) return { animated: false, name: decoded, id: undefined };

  const groups = (FormattingPatterns.Emoji.exec(decoded) ?? CustomEmojiPattern.exec(decoded))
    ?.groups;
  return groups ? { animated: Boolean(groups.animated), name: groups.name!, id: groups.id } : null;
}

/**
 * Resolves an emoji from anything {@link EmojiIdentifierResolvable}, without looking it up in a cache.
 *
 * @param emoji The emoji to resolve.
 * @returns The emoji, only its ID when given a bare ID, or `null` when the value identifies no emoji.
 */
export function resolvePartialEmoji(
  emoji: EmojiIdentifierResolvable,
): PartialEmoji | PartialEmojiOnlyId | null {
  if (typeof emoji === "string")
    return SnowflakePattern.test(emoji) ? { id: emoji } : parseEmoji(emoji);

  const { id, name, animated } = emoji;
  if (!name) return id ? { id } : null;
  return { id: id ?? undefined, name, animated: Boolean(animated) };
}

/**
 * Resolves a {@link ColorResolvable} to its number.
 *
 * @param color The color to resolve.
 * @throws A `TypeError` when the value is no color, a `RangeError` when it is outside `0x000000`-`0xffffff`.
 */
export function resolveColor(color: ColorResolvable): number {
  let resolved: number;

  if (typeof color === "string") {
    if (color === "Random") return Math.floor(Math.random() * (0xffffff + 1));
    if (/^#?[\da-f]{6}$/i.test(color)) return Number.parseInt(color.replace("#", ""), 16);
    resolved = (Colors as Record<string, number>)[color] ?? Number.NaN;
  } else if (Array.isArray(color)) {
    const [red, green, blue] = color as readonly [number, number, number];
    resolved = (red << 16) + (green << 8) + blue;
  } else {
    resolved = color as number;
  }

  if (!Number.isInteger(resolved))
    throw new TypeError(`Cannot resolve ${String(color)} to a color`);
  if (resolved < 0 || resolved > 0xffffff)
    throw new RangeError("Colors must be within 0x000000-0xffffff");
  return resolved;
}
