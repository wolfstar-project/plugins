import type { ColorResolvable } from "../types.js";
import { Colors } from "./Colors.js";

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
