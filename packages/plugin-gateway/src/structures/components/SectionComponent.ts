import { SectionComponent as BaseSectionComponent } from "@discordjs/structures";
import type { APISectionComponent } from "discord-api-types/v10";
import {
  createComponent,
  type ButtonComponent,
  type ComponentInSection,
} from "../../util/components.js";
import { Mixin } from "../Mixin.js";
import { initStructure, kData, StructureMixin } from "../Structure.js";
import { ComponentMixin } from "./Component.js";
import type { ThumbnailComponent } from "./ThumbnailComponent.js";

export interface SectionComponent extends StructureMixin<APISectionComponent>, ComponentMixin {}

/**
 * Text displayed alongside an accessory: `@discordjs/structures`' `SectionComponent`, with its components and accessory
 * like discord.js'.
 */
export class SectionComponent extends BaseSectionComponent<""> {
  /**
   * @param data The raw section.
   * @param relations The related structures, resolved from the cache.
   */
  public constructor(data: APISectionComponent, relations: object = {}) {
    super(data);
    initStructure(this, data, relations);
  }

  /**
   * The text components in this section.
   */
  public get components(): ComponentInSection[] {
    return this[kData].components.map((component) => createComponent(component));
  }

  /**
   * The button or thumbnail shown next to the section.
   */
  public get accessory(): ButtonComponent | ThumbnailComponent {
    return createComponent(this[kData].accessory);
  }
}

Mixin(SectionComponent, [StructureMixin, ComponentMixin]);
