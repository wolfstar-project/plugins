import type { APICheckboxComponent } from "discord-api-types/v10";
import { kData } from "../Structure.js";
import { Component } from "./Component.js";

/**
 * A modal component for a binary choice.
 */
export class CheckboxComponent extends Component<APICheckboxComponent> {
  /**
   * The custom ID of the checkbox.
   */
  public get customId(): string {
    return this[kData].custom_id;
  }

  /**
   * Whether the checkbox is checked by default.
   */
  public get default(): boolean {
    return this[kData].default ?? false;
  }
}
