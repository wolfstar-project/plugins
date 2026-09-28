import type { APILabelComponent } from "discord-api-types/v10";
import { createComponent, type ComponentInLabel } from "../../util/components.js";
import { kData } from "../Structure.js";
import { Component } from "./Component.js";

/**
 * A modal component associating a label and a description with another component, like discord.js' `LabelComponent`.
 */
export class LabelComponent extends Component<APILabelComponent> {
  /**
   * The label.
   */
  public get label(): string {
    return this[kData].label;
  }

  /**
   * The description of the label.
   */
  public get description(): string | null {
    return this[kData].description ?? null;
  }

  /**
   * The component the label is for.
   */
  public get component(): ComponentInLabel {
    return createComponent(this[kData].component);
  }
}
