import { ThumbnailComponent as BaseThumbnailComponent } from "@discordjs/structures";
import type { APIThumbnailComponent } from "discord-api-types/v10";
import { Mixin } from "../Mixin.js";
import { initStructure, kData, StructureMixin } from "../Structure.js";
import { ComponentMixin } from "./Component.js";
import { UnfurledMediaItem } from "./UnfurledMediaItem.js";

export interface ThumbnailComponent extends StructureMixin<APIThumbnailComponent>, ComponentMixin {}

/**
 * A small image, used as the accessory of a section: `@discordjs/structures`' `ThumbnailComponent`, with its media like
 * discord.js'.
 */
export class ThumbnailComponent extends BaseThumbnailComponent<""> {
  /**
   * @param data The raw thumbnail.
   * @param relations The related structures, resolved from the cache.
   */
  public constructor(data: APIThumbnailComponent, relations: object = {}) {
    super(data);
    initStructure(this, data, relations);
  }

  /**
   * The media of the thumbnail.
   */
  public get media(): UnfurledMediaItem {
    return new UnfurledMediaItem(this[kData].media);
  }

  /**
   * The description of the thumbnail.
   */
  public override get description(): string | undefined {
    return this[kData].description ?? undefined;
  }

  /**
   * Whether the thumbnail is marked as a spoiler.
   */
  public override get spoiler(): boolean {
    return this[kData].spoiler ?? false;
  }
}

Mixin(ThumbnailComponent, [StructureMixin, ComponentMixin]);
