import { PremiumButtonComponent as BasePremiumButtonComponent } from "@discordjs/structures";
import type { APIButtonComponentWithSKUId } from "discord-api-types/v10";
import { Mixin } from "../Mixin.js";
import { initStructure, kData, StructureMixin } from "../Structure.js";
import { ComponentMixin } from "./Component.js";

export interface PremiumButtonComponent
  extends StructureMixin<APIButtonComponentWithSKUId>, ComponentMixin {}

/**
 * A button of the `Premium` style, purchasing a SKU: `@discordjs/structures`' `PremiumButtonComponent`.
 */
export class PremiumButtonComponent extends BasePremiumButtonComponent<""> {
  /**
   * @param data The raw button.
   * @param relations The related structures, resolved from the cache.
   */
  public constructor(data: APIButtonComponentWithSKUId, relations: object = {}) {
    super(data);
    initStructure(this, data, relations);
  }

  /**
   * Whether the button is disabled.
   */
  public override get disabled(): boolean {
    return this[kData].disabled ?? false;
  }
}

Mixin(PremiumButtonComponent, [StructureMixin, ComponentMixin]);
