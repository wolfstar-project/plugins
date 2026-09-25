import type { ChannelType } from "discord-api-types/v10";
import type { Channel } from "../Channel.js";
import { kData } from "../Structure.js";

type Data = { guild_id?: string; name?: string | null };

export interface GuildChannelMixin<Type extends ChannelType = ChannelType> extends Channel<Type> {}

/**
 * Adds the fields every guild channel has, threads included.
 */
export class GuildChannelMixin<Type extends ChannelType = ChannelType> {
  /**
   * The ID of the guild, when the payload included it.
   */
  public get guildId(): string | null {
    return (this[kData] as Data).guild_id ?? null;
  }

  public get name(): string {
    return (this[kData] as Data).name ?? "";
  }
}
