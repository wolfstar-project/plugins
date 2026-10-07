import { ChannelSelectMenuComponent as BaseChannelSelectMenuComponent } from "@discordjs/structures";
import type {
  APIChannelSelectComponent,
  APISelectMenuDefaultValue,
  SelectMenuDefaultValueType,
} from "discord-api-types/v10";
import { Mixin } from "../Mixin.js";
import { initStructure, kData, StructureMixin } from "../Structure.js";
import { ComponentMixin } from "./Component.js";

export interface ChannelSelectMenuComponent
  extends StructureMixin<APIChannelSelectComponent>, ComponentMixin {}

/**
 * A select menu of channels: `@discordjs/structures`' `ChannelSelectMenuComponent`, like discord.js'.
 */
export class ChannelSelectMenuComponent extends BaseChannelSelectMenuComponent<""> {
  /**
   * @param data The raw select menu.
   * @param relations The related structures, resolved from the cache.
   */
  public constructor(data: APIChannelSelectComponent, relations: object = {}) {
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
   * The values selected by default.
   */
  public get defaultValues(): readonly APISelectMenuDefaultValue<SelectMenuDefaultValueType>[] {
    return this[kData].default_values ?? [];
  }
}

Mixin(ChannelSelectMenuComponent, [StructureMixin, ComponentMixin]);
