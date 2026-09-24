import type { CacheEntityTypes } from "@wolfstar/plugin-cache";
import type { ImageURLOptions } from "@discordjs/rest";
import { cdn } from "../util/cdn.js";
import { kData, Structure } from "./Structure.js";
import { User } from "./User.js";

/**
 * A member of a Discord guild.
 */
export class GuildMember extends Structure<CacheEntityTypes["members"]> {
  /**
   * The ID of the member's user, or `null` if the payload did not include it.
   */
  public get id(): string | null {
    return this[kData].user?.id ?? null;
  }

  public get guildId() {
    return this[kData].guild_id;
  }

  /**
   * The member's user, or `null` if the payload did not include it.
   */
  public get user(): User | null {
    const { user } = this[kData];
    return user ? new User(user) : null;
  }

  public get nickname(): string | null {
    return this[kData].nick ?? null;
  }

  /**
   * The name to show for this member: their nickname, falling back to their user's display name.
   */
  public get displayName(): string | null {
    return this.nickname ?? this.user?.displayName ?? null;
  }

  /**
   * The IDs of the member's roles, excluding the implicit `@everyone` role.
   */
  public get roleIds(): readonly string[] {
    return this[kData].roles;
  }

  public get joinedTimestamp(): number | null {
    const { joined_at: joinedAt } = this[kData];
    return joinedAt ? Date.parse(joinedAt) : null;
  }

  public get pending(): boolean {
    return this[kData].pending ?? false;
  }

  public get communicationDisabledUntilTimestamp(): number | null {
    const until = this[kData].communication_disabled_until;
    return until ? Date.parse(until) : null;
  }

  /**
   * Gets the URL of the member's guild avatar, or `null` if they have none.
   * @param options The image options.
   */
  public avatarURL(options?: ImageURLOptions): string | null {
    const { avatar } = this[kData];
    const { id } = this;
    return avatar && id ? cdn.guildMemberAvatar(this.guildId, id, avatar, options) : null;
  }

  /**
   * Gets the URL of the member's guild avatar, falling back to their user's avatar.
   * @param options The image options.
   */
  public displayAvatarURL(options?: ImageURLOptions): string | null {
    return this.avatarURL(options) ?? this.user?.displayAvatarURL(options) ?? null;
  }

  public toString(): string {
    return this.id ? `<@${this.id}>` : "";
  }
}
