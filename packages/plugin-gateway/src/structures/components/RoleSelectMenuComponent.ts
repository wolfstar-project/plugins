import { RoleSelectMenuComponent as BaseRoleSelectMenuComponent } from "@discordjs/structures";
import type {
  APIRoleSelectComponent,
  APISelectMenuDefaultValue,
  SelectMenuDefaultValueType,
} from "discord-api-types/v10";
import { Mixin } from "../Mixin.js";
import { initStructure, kData, StructureMixin } from "../Structure.js";
import { ComponentMixin } from "./Component.js";

export interface RoleSelectMenuComponent
  extends StructureMixin<APIRoleSelectComponent>, ComponentMixin {}

/**
 * A select menu of roles: `@discordjs/structures`' `RoleSelectMenuComponent`, like discord.js'.
 */
export class RoleSelectMenuComponent extends BaseRoleSelectMenuComponent<""> {
  /**
   * @param data The raw select menu.
   * @param relations The related structures, resolved from the cache.
   */
  public constructor(data: APIRoleSelectComponent, relations: object = {}) {
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

Mixin(RoleSelectMenuComponent, [StructureMixin, ComponentMixin]);
