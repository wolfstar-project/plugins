import { StringSelectMenuComponent as BaseStringSelectMenuComponent } from "@discordjs/structures";
import type { APISelectMenuOption, APIStringSelectComponent } from "discord-api-types/v10";
import { Mixin } from "../Mixin.js";
import { initStructure, kData, StructureMixin } from "../Structure.js";
import { ComponentMixin } from "./Component.js";

export interface StringSelectMenuComponent
  extends StructureMixin<APIStringSelectComponent>, ComponentMixin {}

/**
 * A select menu of predefined text options: `@discordjs/structures`' `StringSelectMenuComponent`, like discord.js'.
 */
export class StringSelectMenuComponent extends BaseStringSelectMenuComponent<""> {
  /**
   * @param data The raw select menu.
   * @param relations The related structures, resolved from the cache.
   */
  public constructor(data: APIStringSelectComponent, relations: object = {}) {
    super(data);
    initStructure(this, data, relations);
  }

  /**
   * Whether the select menu is disabled.
   */
  public override get disabled(): boolean {
    return this[kData].disabled ?? false;
  }

  /**
   * The options of the select menu.
   */
  public get options(): readonly APISelectMenuOption[] {
    return this[kData].options;
  }
}

Mixin(StringSelectMenuComponent, [StructureMixin, ComponentMixin]);
