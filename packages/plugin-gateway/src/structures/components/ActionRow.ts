import { ActionRowComponent as BaseActionRowComponent } from "@discordjs/structures";
import type { APIActionRowComponent, APIComponentInActionRow } from "discord-api-types/v10";
import {
  createComponent,
  type MessageActionRowComponent,
  type ModalActionRowComponent,
} from "../../util/components.js";
import { Mixin } from "../Mixin.js";
import { initStructure, kData, StructureMixin } from "../Structure.js";
import { ComponentMixin } from "./Component.js";

export interface ActionRow<
  // oxlint-disable-next-line no-unused-vars -- merged with the class, which uses it; the declarations must match.
  Child extends MessageActionRowComponent | ModalActionRowComponent =
    | MessageActionRowComponent
    | ModalActionRowComponent,
>
  extends StructureMixin<APIActionRowComponent<APIComponentInActionRow>>, ComponentMixin {}

/**
 * An action row, holding buttons, a select menu, or a text input: `@discordjs/structures`' `ActionRowComponent`, with
 * its components like discord.js' `ActionRow`.
 *
 * @typeParam Child The components of the row.
 */
export class ActionRow<
  Child extends MessageActionRowComponent | ModalActionRowComponent =
    | MessageActionRowComponent
    | ModalActionRowComponent,
> extends BaseActionRowComponent<APIComponentInActionRow, ""> {
  /**
   * @param data The raw action row.
   * @param relations The related structures, resolved from the cache.
   */
  public constructor(data: APIActionRowComponent<APIComponentInActionRow>, relations: object = {}) {
    super(data as never);
    initStructure(this, data, relations);
  }

  /**
   * The components in this action row.
   */
  public get components(): Child[] {
    return this[kData].components.map((component) => createComponent(component) as Child);
  }
}

Mixin(ActionRow, [StructureMixin, ComponentMixin]);
