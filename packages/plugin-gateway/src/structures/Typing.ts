import type { GatewayTypingStartDispatchData } from "discord-api-types/v10";
import type { AnyChannel } from "../managers/ChannelManager.js";
import { getGatewayClient } from "../util/container.js";
import { GuildMember } from "./GuildMember.js";
import { kData, Structure } from "./Structure.js";
import type { User } from "./User.js";

/**
 * A user starting to type in a channel, carried by the `typingStart` event.
 */
export class Typing extends Structure<GatewayTypingStartDispatchData> {
  public get channelId() {
    return this[kData].channel_id;
  }

  public get guildId(): string | null {
    return this[kData].guild_id ?? null;
  }

  public get userId() {
    return this[kData].user_id;
  }

  /**
   * The time the user started typing, in milliseconds.
   */
  public get startedTimestamp(): number {
    return this[kData].timestamp * 1000;
  }

  public get startedAt(): Date {
    return new Date(this.startedTimestamp);
  }

  /**
   * The typing member, when the channel is in a guild.
   */
  public get member(): GuildMember | null {
    const { member, guild_id: guildId } = this[kData];
    // TODO: use GuildMemberMananger to resolve the member instead this
    return member && guildId ? new GuildMember({ ...member, guild_id: guildId }) : null;
  }

  /**
   * Whether the user typed in a guild channel.
   */
  public inGuild(): boolean {
    return this.guildId !== null;
  }

  /**
   * Fetches the channel the user typed in.
   */
  public fetchChannel(): Promise<AnyChannel> {
    return getGatewayClient().channels.fetch(this.channelId);
  }

  /**
   * Fetches the typing user.
   */
  public fetchUser(): Promise<User> {
    return getGatewayClient().users.fetch(this.userId);
  }
}
