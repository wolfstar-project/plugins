import { Embed as BaseEmbed, Structure as BaseStructure } from "@discordjs/structures";
import type { APIEmbed, APIEmbedField, APIEmbedProvider } from "discord-api-types/v10";
import { isDeepEqual } from "../../util/equal.js";
import {
  transformAPIEmbedAsset,
  transformAPIEmbedAuthor,
  transformAPIEmbedFooter,
  type EmbedAssetData,
  type EmbedAuthorData,
  type EmbedFooterData,
} from "../../util/Transformers.js";
import { Mixin } from "../Mixin.js";
import { initStructure, kData, StructureMixin } from "../Structure.js";

export interface Embed extends StructureMixin<APIEmbed> {}

/**
 * An embed of a received message: `@discordjs/structures`' `Embed`, with its nested parts and discord.js' helpers.
 * Use `@discordjs/builders`' `EmbedBuilder` to create embeds.
 */
export class Embed extends BaseEmbed<""> {
  /**
   * Keeps the raw `timestamp`, which `@discordjs/structures` strips and re-serializes in its own format, so that
   * {@link Embed.toJSON} returns the embed as received.
   */
  public static override readonly DataTemplate: Partial<APIEmbed> = {};

  /**
   * @param data The raw embed.
   * @param relations The related structures, resolved from the cache.
   */
  public constructor(data: APIEmbed, relations: object = {}) {
    super(data);
    initStructure(this, data, relations);
  }

  /**
   * The color as a `#rrggbb` string, `undefined` when the embed has none.
   */
  public override get hexColor(): `#${string}` | undefined {
    const { color } = this;
    return color === undefined ? undefined : `#${color.toString(16).padStart(6, "0")}`;
  }

  public get fields(): readonly APIEmbedField[] {
    return this[kData].fields ?? [];
  }

  /**
   * The thumbnail, camel-cased like discord.js's `Embed#thumbnail`.
   */
  public get thumbnail(): EmbedAssetData | null {
    const { thumbnail } = this[kData];
    return thumbnail ? transformAPIEmbedAsset(thumbnail) : null;
  }

  /**
   * The image, camel-cased like discord.js's `Embed#image`.
   */
  public get image(): EmbedAssetData | null {
    const { image } = this[kData];
    return image ? transformAPIEmbedAsset(image) : null;
  }

  /**
   * The video, camel-cased like discord.js's `Embed#video`.
   */
  public get video(): EmbedAssetData | null {
    const { video } = this[kData];
    return video ? transformAPIEmbedAsset(video) : null;
  }

  /**
   * The author, camel-cased like discord.js's `Embed#author`.
   */
  public get author(): EmbedAuthorData | null {
    const { author } = this[kData];
    return author ? transformAPIEmbedAuthor(author) : null;
  }

  public get provider(): APIEmbedProvider | null {
    return this[kData].provider ?? null;
  }

  /**
   * The footer, camel-cased like discord.js's `Embed#footer`.
   */
  public get footer(): EmbedFooterData | null {
    const { footer } = this[kData];
    return footer ? transformAPIEmbedFooter(footer) : null;
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

  public override toJSON(): APIEmbed {
    return BaseStructure.prototype.toJSON.call(this) as APIEmbed;
  }
}

Mixin(Embed, [StructureMixin]);
