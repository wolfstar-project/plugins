import type { BaseImageURLOptions, ImageURLOptions } from "@discordjs/rest";
import { User as BaseUser } from "@discordjs/structures";
import type { CacheEntityTypes } from "@wolfstar/plugin-cache";
import { cdn } from "../../util/cdn.js";
import {
  transformAPIAvatarDecorationData,
  transformAPIUserPrimaryGuild,
  transformCollectibles,
  type AvatarDecorationData,
  type Collectibles,
  type UserPrimaryGuild,
} from "../../util/Transformers.js";
import { UserFlagsBitField } from "../../util/flags.js";
import {
  MessagePayload,
  type MessageCreateOptions,
  type MessagePayloadResolvable,
} from "../messages/MessagePayload.js";
import type { DMChannel } from "../channels/DMChannel.js";
import type { Message } from "../messages/Message.js";
import { Mixin } from "../Mixin.js";
import { initStructure, kData, kPatch, snowflakeTimestamp, StructureMixin } from "../Structure.js";

export interface User extends StructureMixin<CacheEntityTypes["users"]> {}

/**
 * A Discord user: `@discordjs/structures`' `User`, with CDN URLs and actions through the client.
 */
export class User extends BaseUser {
  /**
   * @param data The raw user.
   * @param relations The related structures, resolved from the cache.
   */
  public constructor(data: CacheEntityTypes["users"], relations: object = {}) {
    super(data);
    initStructure(this, data, relations);
  }

  /**
   * The user's tag: their username for migrated users, `username#discriminator` for legacy ones.
   */
  public get tag(): string {
    return this.discriminator === "0" ? this.username : `${this.username}#${this.discriminator}`;
  }

  /**
   * The user's accent color as a `#rrggbb` string, with the same `undefined`/`null` semantics.
   */
  public get hexAccentColor(): `#${string}` | null | undefined {
    const { accentColor } = this;
    if (typeof accentColor !== "number") return accentColor;
    return `#${accentColor.toString(16).padStart(6, "0")}`;
  }

  /**
   * The user's avatar decoration, camel-cased like discord.js's `User#avatarDecorationData`.
   */
  public get avatarDecorationData(): AvatarDecorationData | null {
    const data = this[kData].avatar_decoration_data;
    return data ? transformAPIAvatarDecorationData(data) : null;
  }

  /**
   * The user's collectibles, camel-cased like discord.js's `User#collectibles`.
   */
  public get collectibles(): Collectibles | null {
    const collectibles = this[kData].collectibles;
    return collectibles ? transformCollectibles(collectibles) : null;
  }

  /**
   * The guild whose tag the user displays, if any, camel-cased like discord.js's `User#primaryGuild`.
   */
  public get primaryGuild(): UserPrimaryGuild | null {
    const guild = this[kData].primary_guild;
    return guild ? transformAPIUserPrimaryGuild(guild) : null;
  }

  /**
   * The user's public flags (badges).
   */
  public get flags(): Readonly<UserFlagsBitField> {
    return new UserFlagsBitField(this[kData].public_flags ?? this[kData].flags ?? 0).freeze();
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
    return guild?.identityGuildId && guild.badge
      ? cdn.guildTagBadge(guild.identityGuildId, guild.badge, options)
      : null;
  }

  /**
   * Opens a direct message channel with the user, or gets the existing one.
   */
  public createDM(): Promise<DMChannel> {
    return this.client.users.createDM(this.id);
  }

  /**
   * Closes the direct message channel with the user.
   */
  public deleteDM(): Promise<DMChannel> {
    return this.client.users.deleteDM(this.id);
  }

  /**
   * Sends a direct message to the user.
   *
   * @param options The message, or its content.
   */
  public send(options: MessagePayloadResolvable<MessageCreateOptions>): Promise<Message> {
    return this.client.users.send(this.id, MessagePayload.create(this, options));
  }

  /**
   * Whether the user is partial: built from its ID alone for an event about an uncached user, see `Partials.User`.
   * Only its ID is reliable then, and {@link User.fetch} completes it.
   */
  public get partial(): boolean {
    return this[kData].username === undefined;
  }

  /**
   * Fetches the user from the API and patches this structure with the result.
   */
  public async fetch(): Promise<this> {
    const user = await this.client.users.fetch(this.id, { force: true });
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
Mixin(User, [StructureMixin]);
