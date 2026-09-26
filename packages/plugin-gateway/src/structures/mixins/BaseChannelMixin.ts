import { type ChannelType } from "discord-api-types/v10";
import { getGatewayClient } from "../../util/container.js";
import type { Channel, ChannelDataType } from "../Channel.js";
import { kPatch } from "../Structure.js";

export interface BaseChannelMixin<Type extends ChannelType = ChannelType> extends Channel<Type> {}

/**
 * Adds the REST actions every channel supports.
 */
export class BaseChannelMixin<Type extends ChannelType = ChannelType> {
  /**
   * Deletes the channel, or closes it for a direct message, and drops it from the cache.
   *
   * @param reason The reason for the audit log.
   */
  public async delete(reason?: string): Promise<this> {
    await getGatewayClient().channels.delete(this.id, reason);
    return this;
  }

  /**
   * Fetches the channel from the API and patches this structure with the result.
   */
  public async fetch(): Promise<this> {
    const data = await getGatewayClient().core.api.channels.get(this.id);
    if (data.type !== this.type) {
      throw new TypeError(`Channel ${this.id} changed type from ${this.type} to ${data.type}`);
    }

    return this[kPatch](data as ChannelDataType<Type>);
  }
}
