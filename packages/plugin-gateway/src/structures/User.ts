import type { BaseImageURLOptions, ImageURLOptions } from "@discordjs/rest";
import type { CacheEntityTypes } from "@wolfstar/plugin-cache";
import type {
  APIAvatarDecorationData,
  APICollectibles,
  APIUserPrimaryGuild,
} from "discord-api-types/v10";
import { cdn } from "../util/cdn.js";
import { getGatewayClient } from "../util/container.js";
import { UserFlagsBitField } from "../util/flags.js";
import type { MessageCreateOptions, MessagePayloadResolvable } from "../util/messages.js";
import type { DMChannel } from "./DMChannel.js";
import type { Message } from "./Message.js";
import { kData, kPatch, snowflakeTimestamp, Structure } from "./Structure.js";

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

  /**
   * The user's tag: their username for migrated users, `username#discriminator` for legacy ones.
   */
  public get tag(): string {
    return this.discriminator === "0" ? this.username : `${this.username}#${this.discriminator}`;
  }

  public get avatar() {
    return this[kData].avatar;
  }

  /**
   * The user's banner hash. Only fetched users have it: `undefined` means unknown, `null` means none.
   */
  public get banner(): string | null | undefined {
    return this[kData].banner;
  }

  /**
   * The user's accent color. Only fetched users have it: `undefined` means unknown, `null` means none.
   */
  public get accentColor(): number | null | undefined {
    return this[kData].accent_color;
  }

  /**
   * The user's accent color as a `#rrggbb` string, with the same `undefined`/`null` semantics.
   */
  public get hexAccentColor(): `#${string}` | null | undefined {
    const { accentColor } = this;
    if (typeof accentColor !== "number") return accentColor;
    return `#${accentColor.toString(16).padStart(6, "0")}`;
  }

  public get avatarDecorationData(): APIAvatarDecorationData | null {
    return this[kData].avatar_decoration_data ?? null;
  }

  public get collectibles(): APICollectibles | null {
    return this[kData].collectibles ?? null;
  }

  /**
   * The guild whose tag the user displays, if any.
   */
  public get primaryGuild(): APIUserPrimaryGuild | null {
    return this[kData].primary_guild ?? null;
  }

  /**
   * The user's public flags (badges).
   */
  public get flags(): Readonly<UserFlagsBitField> {
    return new UserFlagsBitField(this[kData].public_flags ?? this[kData].flags ?? 0).freeze();
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
   * The URL of the user's default avatar.
   */
  public get defaultAvatarURL(): string {
    return cdn.defaultAvatar(this.defaultAvatarIndex);
  }

  /**
   * Gets the URL of the user's avatar, falling back to their default avatar.
   * @param options The image options.
   */
  public displayAvatarURL(options?: ImageURLOptions): string {
    return this.avatarURL(options) ?? this.defaultAvatarURL;
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

  /**
   * Gets the URL of the user's avatar decoration, or `null` if they have none.
   */
  public avatarDecorationURL(): string | null {
    const asset = this.avatarDecorationData?.asset;
    return asset ? cdn.avatarDecoration(asset) : null;
  }

  /**
   * Gets the URL of the user's banner: `undefined` when unknown (not fetched), `null` when they have none.
   * @param options The image options.
   */
  public bannerURL(options?: ImageURLOptions): string | null | undefined {
    const { banner } = this;
    return banner ? cdn.banner(this.id, banner, options) : banner;
  }

  /**
   * Gets the URL of the badge of the guild tag the user displays, or `null` if they display none.
   * @param options The image options.
   */
  public guildTagBadgeURL(options?: BaseImageURLOptions): string | null {
    const guild = this.primaryGuild;
    return guild?.identity_guild_id && guild.badge
      ? cdn.guildTagBadge(guild.identity_guild_id, guild.badge, options)
      : null;
  }

  /**
   * Opens a direct message channel with the user, or gets the existing one.
   */
  public createDM(): Promise<DMChannel> {
    return getGatewayClient().users.createDM(this.id);
  }

  /**
   * Closes the direct message channel with the user.
   */
  public deleteDM(): Promise<DMChannel> {
    return getGatewayClient().users.deleteDM(this.id);
  }

  /**
   * Sends a direct message to the user.
   *
   * @param options The message, or its content.
   */
  public send(options: MessagePayloadResolvable<MessageCreateOptions>): Promise<Message> {
    return getGatewayClient().users.send(this.id, options);
  }

  /**
   * Fetches the user from the API and patches this structure with the result.
   */
  public async fetch(): Promise<this> {
    const user = await getGatewayClient().users.fetch(this.id, { force: true });
    return this[kPatch](user.toJSON());
  }

  /**
   * Whether this user has the same data as another one.
   * @param user The user to compare with.
   */
  public equals(user: User): boolean {
    return (
      this.id === user.id &&
      this.username === user.username &&
      this.discriminator === user.discriminator &&
      this.globalName === user.globalName &&
      this.avatar === user.avatar &&
      this.flags.bitField === user.flags.bitField &&
      this.banner === user.banner &&
      this.accentColor === user.accentColor &&
      this.avatarDecorationData?.asset === user.avatarDecorationData?.asset
    );
  }

  public toString(): `<@${string}>` {
    return `<@${this.id}>`;
  }
}
