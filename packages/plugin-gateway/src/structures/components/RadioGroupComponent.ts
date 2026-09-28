import type { APIRadioGroupComponent, APIRadioGroupOption } from "discord-api-types/v10";
import { kData } from "../Structure.js";
import { Component } from "./Component.js";

/**
 * A modal component to pick one of its options.
 */
export class RadioGroupComponent extends Component<APIRadioGroupComponent> {
  /**
   * The custom ID of the radio group.
   */
  public get customId(): string {
    return this[kData].custom_id;
  }

  /**
   * The options of the radio group.
   */
  public get options(): readonly APIRadioGroupOption[] {
    return this[kData].options;
  }

  /**
   * Whether picking an option is required to submit the modal, `true` by default.
   */
  public get required(): boolean {
    return this[kData].required ?? true;
  }
}
