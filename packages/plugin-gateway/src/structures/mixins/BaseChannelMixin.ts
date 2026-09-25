import { Routes, type APIChannel, type ChannelType } from "discord-api-types/v10";
import { container } from "../../util/container.js";
import type { Channel, ChannelDataType } from "../Channel.js";
import { kPatch } from "../Structure.js";

export interface BaseChannelMixin<Type extends ChannelType = ChannelType> extends Channel<Type> {}

/**
 * Adds the REST actions every channel supports.
 */
export class BaseChannelMixin<Type extends ChannelType = ChannelType> {
  /**
   * Deletes the channel, or closes it for a direct message.
   */
  public async delete(): Promise<this> {
    await container.rest.delete(Routes.channel(this.id));
    return this;
  }

  /**
   * Fetches the channel from the API and patches this structure with the result.
   */
  public async fetch(): Promise<this> {
    const data = (await container.rest.get(Routes.channel(this.id))) as APIChannel;
    if (data.type !== this.type) {
      throw new TypeError(`Channel ${this.id} changed type from ${this.type} to ${data.type}`);
    }

    return this[kPatch](data as ChannelDataType<Type>);
  }
}
