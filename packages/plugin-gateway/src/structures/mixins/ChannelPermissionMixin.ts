import type { ChannelType } from "discord-api-types/v10";
import type { Channel } from "../Channel.js";
import { kData } from "../Structure.js";
import type { APIOverwrite } from "discord-api-types/v10";

type Data = { position?: number; permission_overwrites?: APIOverwrite[] };

export interface ChannelPermissionMixin<
  Type extends ChannelType = ChannelType,
> extends Channel<Type> {}

/**
 * Adds the position and permission overwrites of guild channels other than threads.
 */
export class ChannelPermissionMixin<Type extends ChannelType = ChannelType> {
  public get position(): number {
    return (this[kData] as Data).position ?? 0;
  }

  public get permissionOverwrites(): readonly APIOverwrite[] {
    return (this[kData] as Data).permission_overwrites ?? [];
  }
}
