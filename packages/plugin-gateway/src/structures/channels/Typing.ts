import type { GatewayTypingStartDispatchData } from "discord-api-types/v10";
import type { AnyChannel } from "../../managers/ChannelManager.js";
import type { Guild } from "../guilds/Guild.js";
import { GuildMember } from "../guilds/GuildMember.js";
import { kData, kRelations, Structure } from "../Structure.js";
import { User } from "../users/User.js";

/**
 * The relations of a {@link Typing}, resolved from the cache by the `typingStart` event.
 */
export interface TypingRelations {
  channel?: AnyChannel | null;
  user?: User | null;
  guild?: Guild | null;
  member?: GuildMember | null;
}

/**
 * A user starting to type in a channel, carried by the `typingStart` event.
 */
export class Typing extends Structure<GatewayTypingStartDispatchData> {
  declare public [kRelations]: TypingRelations;

  /**
   * @param data The raw dispatch.
   * @param relations The channel, user, guild, and member as resolved from the cache.
   */
  public constructor(data: GatewayTypingStartDispatchData, relations: TypingRelations = {}) {
    super(data, relations);
  }
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
   * The channel the user typed in, from the cache, like discord.js's `Typing#channel`: `null` when it is not cached.
   */
  public get channel(): AnyChannel | null {
    return this[kRelations].channel ?? null;
  }

  /**
   * The typing user, from the cache, else the user of the payload's member: `null` in a direct message whose user is
   * not cached.
   */
  public get user(): User | null {
    const resolved = this[kRelations].user;
    if (resolved) return resolved;
    const user = this[kData].member?.user;
    return user ? new User(user) : null;
  }

  /**
   * The guild of the channel, from the cache: `null` outside of guilds or when it is not cached.
   */
  public get guild(): Guild | null {
    return this[kRelations].guild ?? null;
  }

  /**
   * The typing member, when the channel is in a guild: the cached member, else the one of the payload.
   */
  public get member(): GuildMember | null {
    const resolved = this[kRelations].member;
    if (resolved) return resolved;
    const { member, guild_id: guildId } = this[kData];
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
    return this.client.channels.fetch(this.channelId);
  }

  /**
   * Fetches the typing user.
   */
  public fetchUser(): Promise<User> {
    return this.client.users.fetch(this.userId);
  }
}
