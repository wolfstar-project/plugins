import { roleKey, type CacheEntityTypes } from "@wolfstar/plugin-cache";
import {
  Routes,
  type APIRole,
  type RESTGetAPIGuildRoleMemberCountsResult,
  type RESTPatchAPIGuildRoleJSONBody,
  type RESTPatchAPIGuildRolePositionsJSONBody,
} from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import { Role, type RoleColors } from "../structures/Role.js";
import { container } from "../util/container.js";
import { PermissionsBitField, type PermissionResolvable } from "../util/PermissionsBitField.js";
import { CachedManager } from "./CachedManager.js";

/**
 * The options to create or edit a role with.
 */
export interface RoleEditOptions {
  name?: string;
  /**
   * The primary color alone, see {@link RoleEditOptions.colors} for gradients.
   */
  color?: number;
  colors?: Partial<RoleColors> & { primaryColor: number };
  hoist?: boolean;
  permissions?: PermissionResolvable;
  mentionable?: boolean;
  /**
   * The icon as a data URI (`data:image/png;base64,...`), `null` to remove it.
   */
  icon?: string | null;
  unicodeEmoji?: string | null;
  /**
   * The reason for the audit log.
   */
  reason?: string;
}

/**
 * A role and the position to move it to.
 */
export interface RolePosition {
  role: string;
  position: number;
}

/**
 * Manages the {@link Role}s known to the client.
 */
export class RoleManager extends CachedManager<"roles", Role, [guildId: string, roleId: string]> {
  public constructor(client: GatewayClient) {
    super(client, "roles");
  }

  public createStructure(data: CacheEntityTypes["roles"]): Role {
    return new Role(data);
  }

  public resolveKey(guildId: string, roleId: string): string {
    return roleKey(guildId, roleId);
  }

  /**
   * Fetches every role of a guild from the API, and caches them.
   *
   * @param guildId The ID of the guild.
   * @returns The roles, highest first.
   */
  public async fetchAll(guildId: string): Promise<Role[]> {
    const roles = (await container.rest.get(Routes.guildRoles(guildId))) as APIRole[];
    const structures = await Promise.all(
      roles.map(async (role) => {
        const raw = { ...role, guild_id: guildId };
        await this.cache?.set(this.resolveKey(guildId, role.id), raw);
        return this.createStructure(raw);
      }),
    );

    return structures.toSorted((a, b) => b.comparePositionTo(a));
  }

  /**
   * Fetches how many members each role of a guild has, `@everyone` excluded.
   *
   * @param guildId The ID of the guild.
   * @returns The member count of every role, by role ID.
   */
  public async fetchMemberCounts(guildId: string): Promise<Map<string, number>> {
    const counts = (await container.rest.get(
      Routes.guildRoleMemberCounts(guildId),
    )) as RESTGetAPIGuildRoleMemberCountsResult;
    return new Map(Object.entries(counts));
  }

  /**
   * Creates a role.
   *
   * @param guildId The ID of the guild.
   * @param options The role's fields.
   */
  public async create(guildId: string, options: RoleEditOptions = {}): Promise<Role> {
    const role = (await container.rest.post(Routes.guildRoles(guildId), {
      body: toRoleBody(options),
      reason: options.reason,
    })) as APIRole;
    return this.store(guildId, role);
  }

  /**
   * Edits a role.
   *
   * @param guildId The ID of the guild.
   * @param roleId The ID of the role.
   * @param options The fields to edit.
   */
  public async edit(guildId: string, roleId: string, options: RoleEditOptions): Promise<Role> {
    const role = (await container.rest.patch(Routes.guildRole(guildId, roleId), {
      body: toRoleBody(options),
      reason: options.reason,
    })) as APIRole;
    return this.store(guildId, role);
  }

  /**
   * Deletes a role.
   *
   * @param guildId The ID of the guild.
   * @param roleId The ID of the role.
   * @param reason The reason for the audit log.
   */
  public async delete(guildId: string, roleId: string, reason?: string): Promise<void> {
    await container.rest.delete(Routes.guildRole(guildId, roleId), { reason });
    await this.cache?.delete(this.resolveKey(guildId, roleId));
  }

  /**
   * Moves a role.
   *
   * @param guildId The ID of the guild.
   * @param roleId The ID of the role.
   * @param position The new position.
   * @param reason The reason for the audit log.
   */
  public async setPosition(
    guildId: string,
    roleId: string,
    position: number,
    reason?: string,
  ): Promise<Role[]> {
    return this.setPositions(guildId, [{ role: roleId, position }], reason);
  }

  /**
   * Moves several roles at once.
   *
   * @param guildId The ID of the guild.
   * @param positions The roles and their new positions.
   * @param reason The reason for the audit log.
   * @returns Every role of the guild, highest first.
   */
  public async setPositions(
    guildId: string,
    positions: readonly RolePosition[],
    reason?: string,
  ): Promise<Role[]> {
    const body: RESTPatchAPIGuildRolePositionsJSONBody = positions.map(({ role, position }) => ({
      id: role,
      position,
    }));
    const roles = (await container.rest.patch(Routes.guildRoles(guildId), {
      body,
      reason,
    })) as APIRole[];
    const structures = await Promise.all(roles.map((role) => this.store(guildId, role)));
    return structures.toSorted((a, b) => b.comparePositionTo(a));
  }

  /**
   * Compares the positions of two roles.
   *
   * @returns A negative number when `a` is lower, a positive one when it is higher, `0` when they are the same.
   */
  public comparePositions(a: Role, b: Role): number {
    return a.comparePositionTo(b);
  }

  /**
   * Fetches the `@everyone` role of a guild, whose ID is the guild's.
   *
   * @param guildId The ID of the guild.
   */
  public everyone(guildId: string): Promise<Role> {
    return this.fetch(guildId, guildId);
  }

  /**
   * Fetches the highest role of a guild.
   *
   * @param guildId The ID of the guild.
   */
  public async highest(guildId: string): Promise<Role | null> {
    return (await this.fetchAll(guildId))[0] ?? null;
  }

  /**
   * Fetches the role Discord gives to the server boosters of a guild, if any.
   *
   * @param guildId The ID of the guild.
   */
  public async premiumSubscriberRole(guildId: string): Promise<Role | null> {
    const roles = await this.fetchAll(guildId);
    return roles.find((role) => role.tags?.premium_subscriber === null) ?? null;
  }

  /**
   * Fetches the role Discord manages for a bot in a guild, if any.
   *
   * @param guildId The ID of the guild.
   * @param botId The ID of the bot user.
   */
  public async botRoleFor(guildId: string, botId: string): Promise<Role | null> {
    const roles = await this.fetchAll(guildId);
    return roles.find((role) => role.tags?.bot_id === botId) ?? null;
  }

  protected async fetchRaw(guildId: string, roleId: string) {
    const role = (await container.rest.get(Routes.guildRole(guildId, roleId))) as APIRole;
    return { ...role, guild_id: guildId };
  }

  private async store(guildId: string, role: APIRole): Promise<Role> {
    const raw = { ...role, guild_id: guildId };
    await this.cache?.set(this.resolveKey(guildId, role.id), raw);
    return this.createStructure(raw);
  }
}

function toRoleBody(options: RoleEditOptions): RESTPatchAPIGuildRoleJSONBody {
  const body: RESTPatchAPIGuildRoleJSONBody = {
    name: options.name,
    color: options.color,
    hoist: options.hoist,
    mentionable: options.mentionable,
    icon: options.icon,
    unicode_emoji: options.unicodeEmoji,
  };
  if (options.permissions !== undefined) {
    body.permissions = PermissionsBitField.resolve(options.permissions).toString();
  }

  if (options.colors) {
    body.colors = {
      primary_color: options.colors.primaryColor,
      secondary_color: options.colors.secondaryColor ?? null,
      tertiary_color: options.colors.tertiaryColor ?? null,
    };
  }

  return body;
}
