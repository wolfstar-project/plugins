import { MediaGalleryItem as BaseMediaGalleryItem } from "@discordjs/structures";
import type { APIMediaGalleryItem } from "discord-api-types/v10";
import { Mixin } from "../Mixin.js";
import { initStructure, kData, StructureMixin } from "../Structure.js";
import { UnfurledMediaItem } from "./UnfurledMediaItem.js";

export interface MediaGalleryItem extends StructureMixin<APIMediaGalleryItem> {}

/**
 * An item of a media gallery component: `@discordjs/structures`' `MediaGalleryItem`, with its media like discord.js'.
 */
export class MediaGalleryItem extends BaseMediaGalleryItem<""> {
  /**
   * @param data The raw media gallery item.
   * @param relations The related structures, resolved from the cache.
   */
  public constructor(data: APIMediaGalleryItem, relations: object = {}) {
    super(data);
    initStructure(this, data, relations);
  }

  /**
   * The media of the item.
   */
  public get media(): UnfurledMediaItem {
    return new UnfurledMediaItem(this[kData].media);
  }

  /**
   * The description of the item.
   */
  public override get description(): string | undefined {
    return this[kData].description ?? undefined;
  }

  /**
   * Whether the item is marked as a spoiler.
   */
  public override get spoiler(): boolean {
    return this[kData].spoiler ?? false;
  }
}

Mixin(MediaGalleryItem, [StructureMixin]);
