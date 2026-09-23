import type { CacheEntityTypes } from "@wolfstar/plugin-cache";
import { CDN, type ImageOptions } from "./cdn.js";
import { kData, snowflakeTimestamp, Structure } from "./Structure.js";

/**
 * A Discord user.
 */
export class User extends Structure<CacheEntityTypes["users"]> {
  public get id() {
    return this[kData].id;
  }

  public get username() {
    return this[kData].username;
  }

  public get discriminator() {
    return this[kData].discriminator;
  }

  /**
   * The user's display name, if set.
   */
  public get globalName() {
    return this[kData].global_name;
  }

  /**
   * The name to show for this user: their {@link User.globalName} when set, their username otherwise.
   */
  public get displayName() {
    return this[kData].global_name ?? this[kData].username;
  }

  public get avatar() {
    return this[kData].avatar;
  }

  public get bot() {
    return this[kData].bot ?? false;
  }

  public get system() {
    return this[kData].system ?? false;
  }

  public get createdTimestamp() {
    return snowflakeTimestamp(this.id);
  }

  public get createdAt() {
    return new Date(this.createdTimestamp);
  }

  /**
   * Gets the URL of the user's avatar, or `null` if they have none.
   * @param options The image options.
   */
  public avatarURL(options?: ImageOptions): string | null {
    const { avatar } = this[kData];
    return avatar ? CDN.avatar(this.id, avatar, options) : null;
  }

  /**
   * Gets the URL of the user's avatar, falling back to their default avatar.
   * @param options The image options.
   */
  public displayAvatarURL(options?: ImageOptions): string {
    return this.avatarURL(options) ?? CDN.defaultAvatar(this.id, this.discriminator);
  }

  public toString(): `<@${string}>` {
    return `<@${this.id}>`;
  }
}
