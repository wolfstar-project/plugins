import type { EmojiURLOptions } from "@discordjs/rest";
import type { APIEmoji } from "discord-api-types/v10";
import { cdn } from "../util/cdn.js";
import { kData, snowflakeTimestamp, Structure } from "./Structure.js";

/**
 * The raw fields any emoji carries: a custom emoji has an ID, a Unicode one only a name.
 */
export type EmojiData = Pick<APIEmoji, "id" | "name"> & Partial<Pick<APIEmoji, "animated">>;

/**
 * An emoji: a custom one (with an ID) or a Unicode one.
 *
 * @typeParam Data The raw emoji data this structure wraps.
 */
export class Emoji<Data extends EmojiData = EmojiData> extends Structure<Data> {
  /**
   * The ID of the emoji, `null` for a Unicode emoji.
   */
  public get id(): string | null {
    return this[kData].id;
  }

  /**
   * The name of the emoji, or the emoji itself for a Unicode one. `null` for deleted custom emojis in reactions.
   */
  public get name(): string | null {
    return this[kData].name;
  }

  public get animated(): boolean {
    return this[kData].animated ?? false;
  }

  /**
   * The form reactions routes expect: `name:id` for custom emojis, the URL-encoded emoji for Unicode ones.
   */
  public get identifier(): string {
    const { id, name } = this;
    if (id) return `${this.animated ? "a:" : ""}${name ?? "_"}:${id}`;
    return encodeURIComponent(name ?? "");
  }

  /**
   * When the custom emoji was created, `null` for a Unicode emoji.
   */
  public get createdTimestamp(): number | null {
    const { id } = this;
    return id ? snowflakeTimestamp(id) : null;
  }

  public get createdAt(): Date | null {
    const { createdTimestamp } = this;
    return createdTimestamp === null ? null : new Date(createdTimestamp);
  }

  /**
   * Gets the URL of the custom emoji's image, `null` for a Unicode emoji. Animated emojis default to a GIF.
   * @param options The image options.
   */
  public imageURL(options?: EmojiURLOptions): string | null {
    const { id } = this;
    if (!id) return null;
    return cdn.emoji(id, options ?? (this.animated ? { extension: "gif" } : undefined));
  }

  /**
   * The emoji as it is written in a message: `<:name:id>`, `<a:name:id>`, or the Unicode emoji itself.
   */
  public toString(): string {
    const { id, name } = this;
    return id ? `<${this.animated ? "a" : ""}:${name ?? "_"}:${id}>` : (name ?? "");
  }
}
