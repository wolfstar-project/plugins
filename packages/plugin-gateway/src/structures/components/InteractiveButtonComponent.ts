import { InteractiveButtonComponent as BaseInteractiveButtonComponent } from "@discordjs/structures";
import type {
  APIButtonComponentWithCustomId,
  APIMessageComponentEmoji,
  ButtonStyle,
} from "discord-api-types/v10";
import { Mixin } from "../Mixin.js";
import { initStructure, kData, StructureMixin } from "../Structure.js";
import { ComponentMixin } from "./Component.js";

export interface InteractiveButtonComponent
  extends StructureMixin<APIButtonComponentWithCustomId>, ComponentMixin {}

/**
 * A button sending an interaction when clicked, of the `Primary`, `Secondary`, `Success`, or `Danger` style:
 * `@discordjs/structures`' `InteractiveButtonComponent`, with discord.js' `ButtonComponent` helpers.
 */
export class InteractiveButtonComponent extends BaseInteractiveButtonComponent<
  ButtonStyle.Danger | ButtonStyle.Primary | ButtonStyle.Secondary | ButtonStyle.Success,
  ""
> {
  /**
   * @param data The raw button.
   * @param relations The related structures, resolved from the cache.
   */
  public constructor(data: APIButtonComponentWithCustomId, relations: object = {}) {
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

Mixin(InteractiveButtonComponent, [StructureMixin, ComponentMixin]);
