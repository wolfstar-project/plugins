import type { ChannelType } from "discord-api-types/v10";
import type { Channel } from "../Channel.js";
import { getGatewayClient } from "../../util/container.js";
import type { Guild } from "../Guild.js";
import { kData, kRelations } from "../Structure.js";

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

  /**
   * The guild, from the cache. `null` when the guild is not cached, or when the channel was not built by a manager: use
   * `fetchGuild()` to always get it.
   */
  public get guild(): Guild | null {
    return this[kRelations].guild ?? null;
  }

  /**
   * Fetches the guild, cache first. `null` when the payload did not include the guild's ID.
   */
  public async fetchGuild(): Promise<Guild | null> {
    const { guildId } = this;
    return guildId ? getGatewayClient().guilds.fetch(guildId) : null;
  }

  public get name(): string {
    return (this[kData] as Data).name ?? "";
  }
}
