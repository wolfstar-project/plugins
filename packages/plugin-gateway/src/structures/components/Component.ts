import { Component as BaseComponent } from "@discordjs/structures";
import type { APIMessageComponent, APIModalComponent } from "discord-api-types/v10";
import { isDeepEqual } from "../../util/equal.js";
import { Mixin } from "../Mixin.js";
import { initStructure, kRelations, StructureMixin } from "../Structure.js";

/**
 * The raw data of any component, in a message or in a modal.
 */
export type APIAnyComponent = APIMessageComponent | APIModalComponent;

/**
 * The members every component of this package shares, mixed into each of them.
 */
export class ComponentMixin {
  /**
   * Whether this component has the same data as another one, nested components included.
   *
   * @param other The component, or raw component data, to compare with.
   */
  public equals(other: Component | APIAnyComponent): boolean {
    return isDeepEqual(
      (this as unknown as Component).toJSON(),
      other instanceof Component ? other.toJSON() : other,
    );
  }
}

export interface Component<Data extends APIAnyComponent = APIAnyComponent>
  extends StructureMixin<Data>, ComponentMixin {}

/**
 * A component of a message or a modal: `@discordjs/structures`' `Component`, like discord.js' `Component`.
 *
 * @remarks
 * Each component type has its own class, like `ActionRow` or `ButtonComponent`s, which `createComponent` picks for a raw
 * component. This class is only instantiated for the types it has no class for. Their raw data is kept as received,
 * nested components included, so `toJSON` serializes them back to the API.
 *
 * @typeParam Data The raw data of the component.
 */
export class Component<Data extends APIAnyComponent = APIAnyComponent> extends BaseComponent<
  Data,
  ""
> {
  /**
   * Whether a value is a component of this package. Most components extend `@discordjs/structures`' own rather than
   * this class, so `instanceof Component` matches any `@discordjs/structures` component carrying
   * {@link StructureMixin}. Subclasses keep the default `instanceof` behavior.
   *
   * @param value The value to check.
   */
  public static override [Symbol.hasInstance](value: unknown): boolean {
    if (this !== Component) return Function.prototype[Symbol.hasInstance].call(this, value);
    return value instanceof BaseComponent && kRelations in value;
  }

  /**
   * @param data The raw component.
   * @param relations The related structures, resolved from the cache.
   */
  public constructor(data: Data, relations: object = {}) {
    super(data as never);
    initStructure(this, data, relations);
  }
}

Mixin(Component, [StructureMixin, ComponentMixin]);
