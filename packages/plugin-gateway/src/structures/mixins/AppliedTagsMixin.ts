import type { ChannelType } from "discord-api-types/v10";
import type { Channel } from "../Channel.js";
import { kData } from "../Structure.js";
import { editChannel } from "./edit.js";

type Data = { applied_tags?: string[] };

export interface AppliedTagsMixin<Type extends ChannelType = ChannelType> extends Channel<Type> {}

/**
 * Adds the tags applied to a thread of a forum or media channel.
 */
export class AppliedTagsMixin<Type extends ChannelType = ChannelType> {
  public get appliedTagIds(): readonly string[] {
    return (this[kData] as Data).applied_tags ?? [];
  }

  /**
   * Sets the tags of the thread.
   *
   * @param appliedTags The IDs of the tags.
   * @param reason The reason for the audit log.
   */
  public setAppliedTags(appliedTags: readonly string[], reason?: string): Promise<this> {
    return editChannel(this, { appliedTags, reason });
  }
}
