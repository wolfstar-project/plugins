import { MediaGalleryComponent as BaseMediaGalleryComponent } from "@discordjs/structures";
import type { APIMediaGalleryComponent } from "discord-api-types/v10";
import { Mixin } from "../Mixin.js";
import { initStructure, kData, StructureMixin } from "../Structure.js";
import { ComponentMixin } from "./Component.js";
import { MediaGalleryItem } from "./MediaGalleryItem.js";

export interface MediaGalleryComponent
  extends StructureMixin<APIMediaGalleryComponent>, ComponentMixin {}

/**
 * A gallery of images and videos: `@discordjs/structures`' `MediaGalleryComponent`, with its items like discord.js'.
 */
export class MediaGalleryComponent extends BaseMediaGalleryComponent<""> {
  /**
   * @param data The raw media gallery.
   * @param relations The related structures, resolved from the cache.
   */
  public constructor(data: APIMediaGalleryComponent, relations: object = {}) {
    super(data);
    initStructure(this, data, relations);
  }

  /**
   * The items of the gallery.
   */
  public get items(): MediaGalleryItem[] {
    return this[kData].items.map((item) => new MediaGalleryItem(item));
  }
}

Mixin(MediaGalleryComponent, [StructureMixin, ComponentMixin]);
