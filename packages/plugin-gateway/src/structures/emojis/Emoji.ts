import type { EmojiURLOptions } from "@discordjs/rest";
import { Emoji as BaseEmoji } from "@discordjs/structures";
import type { APIEmoji } from "discord-api-types/v10";
import { cdn } from "../../util/cdn.js";
import { Mixin } from "../Mixin.js";
import { initStructure, kData, StructureMixin } from "../Structure.js";

/**
 * The raw fields any emoji carries: a custom emoji has an ID, a Unicode one only a name.
 */
export type EmojiData = Pick<APIEmoji, "id" | "name"> & Partial<Pick<APIEmoji, "animated">>;

export interface Emoji<
  Data extends EmojiData = EmojiData,
  Relations extends object = object,
> extends StructureMixin<Data, Relations> {}

/**
 * An emoji, a custom one (with an ID) or a Unicode one: `@discordjs/structures`' `Emoji`, with its identifier, image
 * URL, and mention.
 *
 * @typeParam Data The raw emoji data this structure wraps.
 * @typeParam Relations The related structures, resolved from the cache.
 */
export class Emoji<
  Data extends EmojiData = EmojiData,
  Relations extends object = object,
> extends BaseEmoji {
  /**
   * @param data The raw emoji.
   * @param relations The related structures, resolved from the cache.
   */
  public constructor(data: Data, relations: Relations = {} as Relations) {
    super(data);
    initStructure(this, data, relations);
  }

  public override get animated(): boolean {
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

  public get createdAt(): Date | null {
    return this.createdDate;
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

Mixin(Emoji, [StructureMixin]);
