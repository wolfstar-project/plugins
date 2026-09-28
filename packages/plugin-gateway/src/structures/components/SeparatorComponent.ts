import { SeparatorComponent as BaseSeparatorComponent } from "@discordjs/structures";
import { SeparatorSpacingSize, type APISeparatorComponent } from "discord-api-types/v10";
import { Mixin } from "../Mixin.js";
import { initStructure, kData, StructureMixin } from "../Structure.js";
import { ComponentMixin } from "./Component.js";

export interface SeparatorComponent extends StructureMixin<APISeparatorComponent>, ComponentMixin {}

/**
 * Vertical padding between components: `@discordjs/structures`' `SeparatorComponent`, with Discord's defaults like
 * discord.js'.
 */
export class SeparatorComponent extends BaseSeparatorComponent<""> {
  /**
   * @param data The raw separator.
   * @param relations The related structures, resolved from the cache.
   */
  public constructor(data: APISeparatorComponent, relations: object = {}) {
    super(data);
    initStructure(this, data, relations);
  }

  /**
   * The size of the padding, `Small` by default.
   */
  public override get spacing(): SeparatorSpacingSize {
    return this[kData].spacing ?? SeparatorSpacingSize.Small;
  }

  /**
   * Whether a divider line is shown, `true` by default.
   */
  public override get divider(): boolean {
    return this[kData].divider ?? true;
  }
}

Mixin(SeparatorComponent, [StructureMixin, ComponentMixin]);
