import type { ChannelType } from "discord-api-types/v10";
import { ChannelThreadManager } from "../../managers/ChannelThreadManager.js";
import { getGatewayClient } from "../../util/container.js";
import type { Channel } from "../Channel.js";
import { kData } from "../Structure.js";

type Data = { guild_id?: string };

export interface ChannelThreadsMixin<
  Type extends ChannelType = ChannelType,
> extends Channel<Type> {}

/**
 * Adds the threads of the channels that can have threads.
 */
export class ChannelThreadsMixin<Type extends ChannelType = ChannelType> {
  /**
   * The threads of the channel.
   */
  public get threads(): ChannelThreadManager {
    return new ChannelThreadManager(
      getGatewayClient(),
      this.id,
      (this[kData] as Data).guild_id ?? null,
    );
  }
}
