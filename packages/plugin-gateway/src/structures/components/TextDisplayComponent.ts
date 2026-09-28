import { TextDisplayComponent as BaseTextDisplayComponent } from "@discordjs/structures";
import type { APITextDisplayComponent } from "discord-api-types/v10";
import { Mixin } from "../Mixin.js";
import { initStructure, StructureMixin } from "../Structure.js";
import { ComponentMixin } from "./Component.js";

export interface TextDisplayComponent
  extends StructureMixin<APITextDisplayComponent>, ComponentMixin {}

/**
 * Markdown text: `@discordjs/structures`' `TextDisplayComponent`, like discord.js'.
 */
export class TextDisplayComponent extends BaseTextDisplayComponent<""> {
  /**
   * @param data The raw text display.
   * @param relations The related structures, resolved from the cache.
   */
  public constructor(data: APITextDisplayComponent, relations: object = {}) {
    super(data);
    initStructure(this, data, relations);
  }
}

Mixin(TextDisplayComponent, [StructureMixin, ComponentMixin]);
