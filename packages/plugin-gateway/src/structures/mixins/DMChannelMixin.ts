import type { ChannelType } from "discord-api-types/v10";
import type { Channel } from "../Channel.js";
import { kData } from "../Structure.js";
import type { APIUser } from "discord-api-types/v10";
import { User } from "../User.js";

type Data = { recipients?: APIUser[] };

export interface DMChannelMixin<Type extends ChannelType = ChannelType> extends Channel<Type> {}

/**
 * Adds the recipients of direct messages.
 */
export class DMChannelMixin<Type extends ChannelType = ChannelType> {
  public get recipients(): User[] {
    return ((this[kData] as Data).recipients ?? []).map((user) => new User(user));
  }
}
