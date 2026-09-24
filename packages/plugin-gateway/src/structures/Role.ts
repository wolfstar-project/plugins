import type { ImageURLOptions } from "@discordjs/rest";
import type { Partialize } from "@discordjs/structures";
import type { CacheEntityTypes } from "@wolfstar/plugin-cache";
import type { APIRoleTags } from "discord-api-types/v10";
import type { RoleEditOptions } from "../managers/RoleManager.js";
import { cdn } from "../util/cdn.js";
import { getGatewayClient } from "../util/container.js";
import { RoleFlagsBitField } from "../util/flags.js";
import { compareRolePositions } from "../util/permissions.js";
import { PermissionsBitField, type PermissionResolvable } from "../util/PermissionsBitField.js";
import { kData, kPatch, snowflakeTimestamp, Structure } from "./Structure.js";

/**
 * The colors of a role: `primaryColor` alone for a solid color, with `secondaryColor` for a gradient, and with
 * `tertiaryColor` for the holographic style.
 */
export interface RoleColors {
  primaryColor: number;
  secondaryColor: number | null;
  tertiaryColor: number | null;
}

/**
 * A Discord guild role.
 */
export class Role<Omitted extends keyof CacheEntityTypes["roles"] | "" = ""> extends Structure<
  CacheEntityTypes["roles"],
  Omitted
> {
  /**
   * The template used for removing data from the raw data stored for each role
   */
  public static override readonly DataTemplate: Partial<CacheEntityTypes["roles"]> = {};

  /**
   * @param data - The raw data received from the API for the role
   */
  public constructor(data: Partialize<CacheEntityTypes["roles"], Omitted>) {
    super(data);
  }

  public get id() {
    return this[kData].id;
  }

  public get guildId() {
    return this[kData].guild_id;
  }

  public get name() {
    return this[kData].name;
  }

  /**
   * The primary color of the role, `0` when it has none.
   */
  public get color() {
    return this[kData].colors?.primary_color ?? this[kData].color;
  }

  /**
   * The primary color of the role as a `#rrggbb` string.
   */
  public get hexColor(): `#${string}` {
    return `#${this.color.toString(16).padStart(6, "0")}`;
  }

  public get colors(): RoleColors {
    const { colors } = this[kData];
    return {
      primaryColor: colors?.primary_color ?? this[kData].color,
      secondaryColor: colors?.secondary_color ?? null,
      tertiaryColor: colors?.tertiary_color ?? null,
    };
  }

  public get position() {
    return this[kData].position;
  }

  public get permissions(): Readonly<PermissionsBitField> {
    return new PermissionsBitField(BigInt(this[kData].permissions)).freeze();
  }

  public get hoist() {
    return this[kData].hoist;
  }

  public get managed() {
    return this[kData].managed;
  }

  public get mentionable() {
    return this[kData].mentionable;
  }

  public get icon(): string | null {
    return this[kData].icon ?? null;
  }

  public get unicodeEmoji(): string | null {
    return this[kData].unicode_emoji ?? null;
  }

  /**
   * What the role belongs to: a bot, an integration, the server boosters, or a subscription listing.
   */
  public get tags(): APIRoleTags | null {
    return this[kData].tags ?? null;
  }

  public get flags(): Readonly<RoleFlagsBitField> {
    return new RoleFlagsBitField(this[kData].flags ?? 0).freeze();
  }

  public get createdTimestamp() {
    return snowflakeTimestamp(this.id);
  }

  public get createdAt(): Date {
    return new Date(this.createdTimestamp);
  }

  /**
   * Gets the URL of the role's icon, or `null` if it has none.
   * @param options The image options.
   */
  public iconURL(options?: ImageURLOptions): string | null {
    const { icon } = this;
    return icon ? cdn.roleIcon(this.id, icon, options) : null;
  }

  /**
   * Compares this role's position with another one's.
   *
   * @param role The role to compare with.
   * @returns A negative number when this role is lower, a positive one when it is higher, `0` when they are the same.
   */
  public comparePositionTo(role: Pick<Role, "id" | "position">): number {
    return compareRolePositions(this, role);
  }

  /**
   * Whether the client's member can edit this role, i.e. it has `ManageRoles` and a higher role.
   */
  public async fetchEditable(): Promise<boolean> {
    if (this.managed) return false;

    const client = getGatewayClient();
    const me = await client.members.fetchMe(this.guildId);
    const permissions = await me.fetchPermissions();
    if (!permissions.has("ManageRoles")) return false;

    const highest = await me.roles.fetchHighest();
    return highest !== null && highest.comparePositionTo(this) > 0;
  }

  /**
   * Edits the role.
   *
   * @param options The fields to edit.
   * @returns This role, patched.
   */
  public async edit(options: RoleEditOptions): Promise<this> {
    const role = await getGatewayClient().roles.edit(this.guildId, this.id, options);
    return this[kPatch](role.toJSON());
  }

  public setName(name: string, reason?: string): Promise<this> {
    return this.edit({ name, reason });
  }

  public setColors(colors: Partial<RoleColors> & { primaryColor: number }, reason?: string) {
    return this.edit({ colors, reason });
  }

  public setHoist(hoist = true, reason?: string): Promise<this> {
    return this.edit({ hoist, reason });
  }

  public setPermissions(permissions: PermissionResolvable, reason?: string): Promise<this> {
    return this.edit({ permissions, reason });
  }

  public setMentionable(mentionable = true, reason?: string): Promise<this> {
    return this.edit({ mentionable, reason });
  }

  /**
   * Sets the role's icon, as a data URI (`data:image/png;base64,...`), or removes it with `null`.
   */
  public setIcon(icon: string | null, reason?: string): Promise<this> {
    return this.edit({ icon, reason });
  }

  public setUnicodeEmoji(unicodeEmoji: string | null, reason?: string): Promise<this> {
    return this.edit({ unicodeEmoji, reason });
  }

  /**
   * Moves the role.
   *
   * @param position The new position.
   * @param reason The reason for the audit log.
   */
  public async setPosition(position: number, reason?: string): Promise<this> {
    await getGatewayClient().roles.setPositions(
      this.guildId,
      [{ role: this.id, position }],
      reason,
    );
    return this[kPatch]({ position });
  }

  /**
   * Deletes the role.
   *
   * @param reason The reason for the audit log.
   */
  public async delete(reason?: string): Promise<this> {
    await getGatewayClient().roles.delete(this.guildId, this.id, reason);
    return this;
  }

  /**
   * Whether this role has the same data as another one.
   * @param role The role to compare with.
   */
  public equals(role: Role): boolean {
    return (
      this.id === role.id &&
      this.name === role.name &&
      this.color === role.color &&
      this.hoist === role.hoist &&
      this.position === role.position &&
      this[kData].permissions === role[kData].permissions &&
      this.managed === role.managed &&
      this.icon === role.icon &&
      this.unicodeEmoji === role.unicodeEmoji
    );
  }

  public toString(): `<@&${string}>` | "@everyone" {
    // `@everyone` has the guild's ID and is written as is.
    return this.id === this.guildId ? "@everyone" : `<@&${this.id}>`;
  }
}
