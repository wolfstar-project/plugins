import type { BaseImageURLOptions } from "@discordjs/rest";
import type { APIStickerPack } from "discord-api-types/v10";
import { cdn } from "../util/cdn.js";
import { Sticker } from "./Sticker.js";
import { kData, snowflakeTimestamp, Structure } from "./Structure.js";

/**
 * A pack of standard stickers.
 */
export class StickerPack extends Structure<APIStickerPack> {
  public get id() {
    return this[kData].id;
  }

  public get name() {
    return this[kData].name;
  }

  public get description() {
    return this[kData].description;
  }

  /**
   * The ID of the pack's SKU.
   */
  public get skuId() {
    return this[kData].sku_id;
  }

  public get coverStickerId(): string | null {
    return this[kData].cover_sticker_id ?? null;
  }

  public get bannerId(): string | null {
    return this[kData].banner_asset_id ?? null;
  }

  public get stickers(): Sticker[] {
    return this[kData].stickers.map((sticker) => new Sticker(sticker));
  }

  /**
   * The sticker shown as the pack's cover, if any.
   */
  public get coverSticker(): Sticker | null {
    const { coverStickerId } = this;
    return this.stickers.find((sticker) => sticker.id === coverStickerId) ?? null;
  }

  public get createdTimestamp() {
    return snowflakeTimestamp(this.id);
  }

  public get createdAt() {
    return new Date(this.createdTimestamp);
  }

  /**
   * Gets the URL of the pack's banner, or `null` if it has none.
   * @param options The image options.
   */
  public bannerURL(options?: BaseImageURLOptions): string | null {
    const { bannerId } = this;
    return bannerId ? cdn.stickerPackBanner(bannerId, options) : null;
  }
}
