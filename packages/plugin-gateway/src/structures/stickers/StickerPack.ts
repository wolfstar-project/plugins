import type { BaseImageURLOptions } from "@discordjs/rest";
import { StickerPack as BaseStickerPack } from "@discordjs/structures";
import type { APIStickerPack } from "discord-api-types/v10";
import { cdn } from "../../util/cdn.js";
import { Sticker } from "./Sticker.js";
import { Mixin } from "../Mixin.js";
import { initStructure, kData, snowflakeTimestamp, StructureMixin } from "../Structure.js";

export interface StickerPack extends StructureMixin<APIStickerPack> {}

/**
 * A pack of standard stickers: `@discordjs/structures`' `StickerPack`, with its stickers and banner URL.
 */
export class StickerPack extends BaseStickerPack {
  /**
   * @param data The raw sticker pack.
   * @param relations The related structures, resolved from the cache.
   */
  public constructor(data: APIStickerPack, relations: object = {}) {
    super(data);
    initStructure(this, data, relations);
  }

  /**
   * The ID of the pack's banner asset, `null` if it has none.
   */
  public get bannerId(): string | null {
    return this.bannerAssetId ?? null;
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

  public override get createdTimestamp(): number {
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

Mixin(StickerPack, [StructureMixin]);
