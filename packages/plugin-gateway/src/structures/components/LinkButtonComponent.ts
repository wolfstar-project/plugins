import { LinkButtonComponent as BaseLinkButtonComponent } from "@discordjs/structures";
import type { APIButtonComponentWithURL, APIMessageComponentEmoji } from "discord-api-types/v10";
import { Mixin } from "../Mixin.js";
import { initStructure, kData, StructureMixin } from "../Structure.js";
import { ComponentMixin } from "./Component.js";

export interface LinkButtonComponent
  extends StructureMixin<APIButtonComponentWithURL>, ComponentMixin {}

/**
 * A button of the `Link` style, opening a URL: `@discordjs/structures`' `LinkButtonComponent`, with discord.js'
 * `ButtonComponent` helpers.
 */
export class LinkButtonComponent extends BaseLinkButtonComponent<""> {
  /**
   * @param data The raw button.
   * @param relations The related structures, resolved from the cache.
   */
  public constructor(data: APIButtonComponentWithURL, relations: object = {}) {
    super(data);
    initStructure(this, data, relations);
  }

  /**
   * Whether the button is disabled.
   */
  public override get disabled(): boolean {
    return this[kData].disabled ?? false;
  }

  /**
   * The emoji on the button.
   */
  public get emoji(): APIMessageComponentEmoji | null {
    return this[kData].emoji ?? null;
  }
}

Mixin(LinkButtonComponent, [StructureMixin, ComponentMixin]);
