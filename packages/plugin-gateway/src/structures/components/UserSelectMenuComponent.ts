import { UserSelectMenuComponent as BaseUserSelectMenuComponent } from "@discordjs/structures";
import type {
  APISelectMenuDefaultValue,
  APIUserSelectComponent,
  SelectMenuDefaultValueType,
} from "discord-api-types/v10";
import { Mixin } from "../Mixin.js";
import { initStructure, kData, StructureMixin } from "../Structure.js";
import { ComponentMixin } from "./Component.js";

export interface UserSelectMenuComponent
  extends StructureMixin<APIUserSelectComponent>, ComponentMixin {}

/**
 * A select menu of users: `@discordjs/structures`' `UserSelectMenuComponent`, like discord.js'.
 */
export class UserSelectMenuComponent extends BaseUserSelectMenuComponent<""> {
  /**
   * @param data The raw select menu.
   * @param relations The related structures, resolved from the cache.
   */
  public constructor(data: APIUserSelectComponent, relations: object = {}) {
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

Mixin(UserSelectMenuComponent, [StructureMixin, ComponentMixin]);
