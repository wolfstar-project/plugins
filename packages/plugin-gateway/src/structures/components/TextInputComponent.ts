import { TextInputComponent as BaseTextInputComponent } from "@discordjs/structures";
import type { APITextInputComponent } from "discord-api-types/v10";
import { Mixin } from "../Mixin.js";
import { initStructure, StructureMixin } from "../Structure.js";
import { ComponentMixin } from "./Component.js";

export interface TextInputComponent extends StructureMixin<APITextInputComponent>, ComponentMixin {}

/**
 * A text field of a modal: `@discordjs/structures`' `TextInputComponent`, like discord.js'.
 */
export class TextInputComponent extends BaseTextInputComponent<""> {
  /**
   * @param data The raw text input.
   * @param relations The related structures, resolved from the cache.
   */
  public constructor(data: APITextInputComponent, relations: object = {}) {
    super(data);
    initStructure(this, data, relations);
  }
}

Mixin(TextInputComponent, [StructureMixin, ComponentMixin]);
