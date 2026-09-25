import type { ChannelType } from "discord-api-types/v10";
import type { Channel } from "../Channel.js";
import { kData } from "../Structure.js";

type Data = { owner_id?: string };

export interface ChannelOwnerMixin<Type extends ChannelType = ChannelType> extends Channel<Type> {}

/**
 * Adds the owner of threads and group direct messages.
 */
export class ChannelOwnerMixin<Type extends ChannelType = ChannelType> {
  public get ownerId(): string | null {
    return (this[kData] as Data).owner_id ?? null;
  }
}
