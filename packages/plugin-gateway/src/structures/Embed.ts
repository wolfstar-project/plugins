import type {
  APIEmbed,
  APIEmbedAuthor,
  APIEmbedField,
  APIEmbedFooter,
  APIEmbedImage,
  APIEmbedProvider,
  APIEmbedThumbnail,
  APIEmbedVideo,
} from "discord-api-types/v10";
import { isDeepEqual } from "../util/equal.js";
import { kData, Structure } from "./Structure.js";

/**
 * An embed of a received message. Use `@discordjs/builders`' `EmbedBuilder` to create embeds.
 */
export class Embed extends Structure<APIEmbed> {
  public get title(): string | null {
    return this[kData].title ?? null;
  }

  public get description(): string | null {
    return this[kData].description ?? null;
  }

  public get url(): string | null {
    return this[kData].url ?? null;
  }

  public get color(): number | null {
    return this[kData].color ?? null;
  }

  /**
   * The color as a `#rrggbb` string, `null` when the embed has none.
   */
  public get hexColor(): `#${string}` | null {
    const { color } = this;
    return color === null ? null : `#${color.toString(16).padStart(6, "0")}`;
  }

  /**
   * The ISO timestamp shown in the footer, if any.
   */
  public get timestamp(): string | null {
    return this[kData].timestamp ?? null;
  }

  public get fields(): readonly APIEmbedField[] {
    return this[kData].fields ?? [];
  }

  public get thumbnail(): APIEmbedThumbnail | null {
    return this[kData].thumbnail ?? null;
  }

  public get image(): APIEmbedImage | null {
    return this[kData].image ?? null;
  }

  public get video(): APIEmbedVideo | null {
    return this[kData].video ?? null;
  }

  public get author(): APIEmbedAuthor | null {
    return this[kData].author ?? null;
  }

  public get provider(): APIEmbedProvider | null {
    return this[kData].provider ?? null;
  }

  public get footer(): APIEmbedFooter | null {
    return this[kData].footer ?? null;
  }

  /**
   * The number of characters counting towards Discord's 6000 characters limit.
   */
  public get length(): number {
    return (
      (this.title?.length ?? 0) +
      (this.description?.length ?? 0) +
      this.fields.reduce((sum, field) => sum + field.name.length + field.value.length, 0) +
      (this.footer?.text.length ?? 0) +
      (this.author?.name.length ?? 0)
    );
  }

  /**
   * Whether this embed has the same data as another one.
   * @param embed The embed, or raw embed data, to compare with.
   */
  public equals(embed: Embed | APIEmbed): boolean {
    return isDeepEqual(this.toJSON(), embed instanceof Embed ? embed.toJSON() : embed);
  }
}
