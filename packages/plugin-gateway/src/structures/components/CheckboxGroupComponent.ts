import type { APICheckboxGroupComponent, APICheckboxGroupOption } from "discord-api-types/v10";
import { kData } from "../Structure.js";
import { Component } from "./Component.js";

/**
 * A modal component to pick any of its options.
 */
export class CheckboxGroupComponent extends Component<APICheckboxGroupComponent> {
  /**
   * The custom ID of the checkbox group.
   */
  public get customId(): string {
    return this[kData].custom_id;
  }

  /**
   * The options of the checkbox group.
   */
  public get options(): readonly APICheckboxGroupOption[] {
    return this[kData].options;
  }

  /**
   * The minimum number of options to pick.
   */
  public get minValues(): number | null {
    return this[kData].min_values ?? null;
  }

  /**
   * The maximum number of options to pick.
   */
  public get maxValues(): number | null {
    return this[kData].max_values ?? null;
  }

  /**
   * Whether picking options is required to submit the modal, `true` by default.
   */
  public get required(): boolean {
    return this[kData].required ?? true;
  }
}
