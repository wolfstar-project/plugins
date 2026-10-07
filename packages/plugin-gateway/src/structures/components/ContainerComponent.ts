import { ContainerComponent as BaseContainerComponent } from "@discordjs/structures";
import type { APIContainerComponent } from "discord-api-types/v10";
import { createComponent, type ComponentInContainer } from "../../util/components.js";
import { Mixin } from "../Mixin.js";
import { initStructure, kData, StructureMixin } from "../Structure.js";
import { ComponentMixin } from "./Component.js";

export interface ContainerComponent extends StructureMixin<APIContainerComponent>, ComponentMixin {}

/**
 * A container visually grouping components, like an embed: `@discordjs/structures`' `ContainerComponent`, with its
 * components like discord.js'.
 */
export class ContainerComponent extends BaseContainerComponent<""> {
  /**
   * @param data The raw container.
   * @param relations The related structures, resolved from the cache.
   */
  public constructor(data: APIContainerComponent, relations: object = {}) {
    super(data);
    initStructure(this, data, relations);
  }

  /**
   * The components in this container.
   */
  public get components(): ComponentInContainer[] {
    return this[kData].components.map((component) => createComponent(component));
  }

  /**
   * The accent color of the container, `null` when it has none.
   */
  public override get accentColor(): number | null {
    return this[kData].accent_color ?? null;
  }

  /**
   * The accent color as a `#rrggbb` string, `null` when the container has none.
   */
  public override get hexAccentColor(): `#${string}` | null {
    const { accentColor } = this;
    return accentColor === null ? null : `#${accentColor.toString(16).padStart(6, "0")}`;
  }

  /**
   * Whether the container is marked as a spoiler.
   */
  public override get spoiler(): boolean {
    return this[kData].spoiler ?? false;
  }
}

Mixin(ContainerComponent, [StructureMixin, ComponentMixin]);
