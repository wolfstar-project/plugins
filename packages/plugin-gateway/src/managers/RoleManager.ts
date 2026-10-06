import { roleKey, type Awaitable, type CacheEntityTypes } from "@wolfstar/plugin-cache";
import {
  type APIRole,
  type RESTPatchAPIGuildRoleJSONBody,
  type RESTPatchAPIGuildRolePositionsJSONBody,
} from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import { Role, type RoleColors } from "../structures/guilds/Role.js";
import { GatewayError } from "../errors/GatewayError.js";
import { whenAll } from "../util/cache.js";
import { computePositions, discordSort } from "../util/Util.js";
import { PermissionsBitField, type PermissionResolvable } from "../util/PermissionsBitField.js";
import { CachedManager, fillGuildId, withGuildId, type GuildArgs } from "./CachedManager.js";
import type { SetPositionOptions } from "./GuildChannelManager.js";
import { resolveImageOption, type ImageResolvable } from "../util/DataResolver.js";

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
   * The icon: a data URI (`data:image/png;base64,...`), or anything `resolveImage` reads. `null` removes it.
   */
  icon?: ImageResolvable | null;
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
 *
 * `guild.roles` (or `client.guilds.roles(guildId)`) is this manager built for one guild, like discord.js's:
 * `cache` takes the role's ID alone, and the methods lose their `guildId` argument.
 *
 * @typeParam InGuild Whether the manager was built for one guild.
 */
export class RoleManager<InGuild extends boolean = false> extends CachedManager<
  "roles",
  Role,
  [guildId: string, roleId: string],
  GuildArgs<InGuild, [roleId: string]>
> {
  /**
   * The ID of the guild this manager was built for, `undefined` on `client.roles`.
   */
  public readonly guildId: InGuild extends true ? string : undefined;

  /**
   * @param client The client.
   * @param guildId The guild to build the manager for.
   */
  public constructor(client: GatewayClient, guildId?: string) {
    super(client, "roles", guildId);
    this.guildId = guildId as this["guildId"];
  }

  protected createStructure(data: CacheEntityTypes["roles"]): Role {
    return new Role(data);
  }

  public keyOf(data: CacheEntityTypes["roles"]): string {
    return this.resolveKey(data.guild_id, data.id);
  }

  public override _hydrate(data: CacheEntityTypes["roles"]): Awaitable<Role> {
    return whenAll([this.cachedGuild(data.guild_id)], ([guild]) => new Role(data, { guild }));
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
  public async fetchAll(...args: GuildArgs<InGuild, []>): Promise<Role[]> {
    const [guildId] = withGuildId<[]>(args);
    const roles = await this.client.api.guilds.getRoles(guildId);
    const structures = await Promise.all(roles.map((role) => this.store(guildId, role)));

    return discordSort(structures).toReversed();
  }

  /**
   * Fetches how many members each role of a guild has, `@everyone` excluded.
   *
   * @param guildId The ID of the guild.
   * @returns The member count of every role, by role ID.
   */
  public async fetchMemberCounts(...args: GuildArgs<InGuild, []>): Promise<Map<string, number>> {
    const [guildId] = withGuildId<[]>(args);
    const counts = await this.client.api.guilds.getRoleMemberCounts(guildId);
    return new Map(Object.entries(counts));
  }

  /**
   * Creates a role.
   *
   * @param guildId The ID of the guild.
   * @param options The role's fields.
   */
  public async create(...args: GuildArgs<InGuild, [options?: RoleEditOptions]>): Promise<Role> {
    const [guildId, options = {}] = withGuildId<[options?: RoleEditOptions]>(args);
    const role = await this.client.api.guilds.createRole(guildId, await toRoleBody(options), {
      reason: options.reason,
    });
    return this.store(guildId, role);
  }

  /**
   * Edits a role.
   *
   * @param guildId The ID of the guild.
   * @param roleId The ID of the role.
   * @param options The fields to edit.
   */
  public async edit(
    ...args: GuildArgs<InGuild, [roleId: string, options: RoleEditOptions]>
  ): Promise<Role> {
    const [guildId, roleId, options] =
      withGuildId<[roleId: string, options: RoleEditOptions]>(args);
    const role = await this.client.api.guilds.editRole(guildId, roleId, await toRoleBody(options), {
      reason: options.reason,
    });
    return this.store(guildId, role);
  }

  /**
   * Deletes a role.
   *
   * @param guildId The ID of the guild.
   * @param roleId The ID of the role.
   * @param reason The reason for the audit log.
   */
  public async delete(
    ...args: GuildArgs<InGuild, [roleId: string, reason?: string]>
  ): Promise<void> {
    const [guildId, roleId, reason] = withGuildId<[roleId: string, reason?: string]>(args);
    await this.client.api.guilds.deleteRole(guildId, roleId, { reason });
    await this.cache.delete(this.resolveKey(guildId, roleId));
  }

  /**
   * Moves a role among the roles of its guild, like discord.js's `RoleManager#setPosition`.
   *
   * @param guildId The ID of the guild.
   * @param roleId The ID of the role.
   * @param position The index to move it to, lowest role first, or the offset to move it by with `relative`. An index
   * out of range leaves the roles where they are.
   * @param options Whether the position is relative and the reason for the audit log, or the reason alone.
   * @returns Every role of the guild, highest first.
   */
  public async setPosition(
    ...args: GuildArgs<
      InGuild,
      [roleId: string, position: number, options?: SetPositionOptions | string]
    >
  ): Promise<Role[]> {
    const [guildId, roleId, position, options = {}] =
      withGuildId<[roleId: string, position: number, options?: SetPositionOptions | string]>(args);
    const { relative = false, reason } =
      typeof options === "string" ? { reason: options } : options;
    // fetchAll sorts highest first: reversed, the roles are in discordSort order.
    const sorted = (await this.client.roles.fetchAll(guildId)).toReversed();
    if (!sorted.some((role) => role.id === roleId)) {
      throw new GatewayError("GuildRoleUnknown", guildId, roleId);
    }

    const positions = computePositions(roleId, position, relative, sorted);
    return this.client.roles.setPositions(
      guildId,
      positions.map((entry) => ({ role: entry.id, position: entry.position })),
      reason,
    );
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
    ...args: GuildArgs<InGuild, [positions: readonly RolePosition[], reason?: string]>
  ): Promise<Role[]> {
    const [guildId, positions, reason] =
      withGuildId<[positions: readonly RolePosition[], reason?: string]>(args);
    const body: RESTPatchAPIGuildRolePositionsJSONBody = positions.map(({ role, position }) => ({
      id: role,
      position,
    }));
    const roles = await this.client.api.guilds.setRolePositions(guildId, body, { reason });
    const structures = await Promise.all(roles.map((role) => this.store(guildId, role)));
    return discordSort(structures).toReversed();
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
  public everyone(...args: GuildArgs<InGuild, []>): Promise<Role> {
    const [guildId] = withGuildId<[]>(args);
    return this.client.roles.fetch(guildId, guildId);
  }

  /**
   * Fetches the highest role of a guild.
   *
   * @param guildId The ID of the guild.
   */
  public async highest(...args: GuildArgs<InGuild, []>): Promise<Role | null> {
    const [guildId] = withGuildId<[]>(args);
    return (await this.client.roles.fetchAll(guildId))[0] ?? null;
  }

  /**
   * Fetches the role Discord gives to the server boosters of a guild, if any.
   *
   * @param guildId The ID of the guild.
   */
  public async premiumSubscriberRole(...args: GuildArgs<InGuild, []>): Promise<Role | null> {
    const [guildId] = withGuildId<[]>(args);
    const roles = await this.client.roles.fetchAll(guildId);
    return roles.find((role) => role.tags?.premiumSubscriberRole) ?? null;
  }

  /**
   * Fetches the role Discord manages for a bot in a guild, if any.
   *
   * @param guildId The ID of the guild.
   * @param botId The ID of the bot user.
   */
  public async botRoleFor(...args: GuildArgs<InGuild, [botId: string]>): Promise<Role | null> {
    const [guildId, botId] = withGuildId<[botId: string]>(args);
    const roles = await this.client.roles.fetchAll(guildId);
    return roles.find((role) => role.tags?.botId === botId) ?? null;
  }

  protected async fetchRaw(guildId: string, roleId: string) {
    const role = await this.client.api.guilds.getRole(guildId, roleId);
    return { ...role, guild_id: guildId };
  }

  private store(guildId: string, role: APIRole): Promise<Role> {
    return this._add({ ...role, guild_id: guildId });
  }
}

fillGuildId(RoleManager, (client) => client.roles, [
  "fetch",
  "refresh",
  "fetchAll",
  "fetchMemberCounts",
  "create",
  "edit",
  "delete",
  "setPosition",
  "setPositions",
  "everyone",
  "highest",
  "premiumSubscriberRole",
  "botRoleFor",
]);

async function toRoleBody(options: RoleEditOptions): Promise<RESTPatchAPIGuildRoleJSONBody> {
  const body: RESTPatchAPIGuildRoleJSONBody = {
    name: options.name,
    color: options.color,
    hoist: options.hoist,
    mentionable: options.mentionable,
    icon: await resolveImageOption(options.icon),
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
