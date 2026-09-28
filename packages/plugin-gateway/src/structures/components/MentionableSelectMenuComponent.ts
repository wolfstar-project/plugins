import { MentionableSelectMenuComponent as BaseMentionableSelectMenuComponent } from "@discordjs/structures";
import type {
  APIMentionableSelectComponent,
  APISelectMenuDefaultValue,
  SelectMenuDefaultValueType,
} from "discord-api-types/v10";
import { Mixin } from "../Mixin.js";
import { initStructure, kData, StructureMixin } from "../Structure.js";
import { ComponentMixin } from "./Component.js";

export interface MentionableSelectMenuComponent
  extends StructureMixin<APIMentionableSelectComponent>, ComponentMixin {}

/**
 * A select menu of users and roles: `@discordjs/structures`' `MentionableSelectMenuComponent`, like discord.js'.
 */
export class MentionableSelectMenuComponent extends BaseMentionableSelectMenuComponent<""> {
  /**
   * @param data The raw select menu.
   * @param relations The related structures, resolved from the cache.
   */
  public constructor(data: APIMentionableSelectComponent, relations: object = {}) {
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

Mixin(MentionableSelectMenuComponent, [StructureMixin, ComponentMixin]);
