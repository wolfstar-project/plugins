import type { CacheEntityTypes } from "@wolfstar/plugin-cache";
import type { ImageURLOptions } from "@discordjs/rest";
import { cdn } from "../util/cdn.js";
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
  public avatarURL(options?: ImageURLOptions): string | null {
    const { avatar } = this[kData];
    return avatar ? cdn.avatar(this.id, avatar, options) : null;
  }

  /**
   * Gets the URL of the user's avatar, falling back to their default avatar.
   * @param options The image options.
   */
  public displayAvatarURL(options?: ImageURLOptions): string {
    return this.avatarURL(options) ?? cdn.defaultAvatar(this.defaultAvatarIndex);
  }

  /**
   * The index of the user's default avatar: migrated users (discriminator `"0"`) derive it from their ID, legacy ones
   * from their discriminator.
   */
  public get defaultAvatarIndex(): number {
    return this.discriminator === "0"
      ? Number((BigInt(this.id) >> 22n) % 6n)
      : Number(this.discriminator) % 5;
  }

  public toString(): `<@${string}>` {
    return `<@${this.id}>`;
  }
}
