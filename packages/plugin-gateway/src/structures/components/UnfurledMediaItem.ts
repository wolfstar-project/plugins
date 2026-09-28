import { UnfurledMediaItem as BaseUnfurledMediaItem } from "@discordjs/structures";
import type { APIUnfurledMediaItem } from "discord-api-types/v10";
import { Mixin } from "../Mixin.js";
import { initStructure, StructureMixin } from "../Structure.js";

export interface UnfurledMediaItem extends StructureMixin<APIUnfurledMediaItem> {}

/**
 * A media item of a thumbnail, file, or media gallery component: `@discordjs/structures`' `UnfurledMediaItem`, like
 * discord.js'.
 */
export class UnfurledMediaItem extends BaseUnfurledMediaItem<""> {
  /**
   * @param data The raw media item.
   * @param relations The related structures, resolved from the cache.
   */
  public constructor(data: APIUnfurledMediaItem, relations: object = {}) {
    super(data);
    initStructure(this, data, relations);
  }
}

Mixin(UnfurledMediaItem, [StructureMixin]);
