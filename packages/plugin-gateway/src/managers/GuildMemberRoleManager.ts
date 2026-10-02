import type { Collection } from "@discordjs/collection";
import type { Awaitable } from "@wolfstar/plugin-cache";
import type { Snowflake } from "discord-api-types/v10";
import { GatewayError, GatewayTypeError } from "../errors/GatewayError.js";
import type { Guild } from "../structures/guilds/Guild.js";
import type { GuildMember } from "../structures/guilds/GuildMember.js";
import type { Role } from "../structures/guilds/Role.js";
import { kClone } from "../structures/Structure.js";
import type { RoleResolvable } from "../types.js";
import { whenAll } from "../util/cache.js";
import {
  cachedRoles,
  isRoleResolvables,
  resolveRoleId,
  resolveRoleIds,
  type RoleResolvables,
} from "../util/roles.js";
import { BaseManager } from "./BaseManager.js";

// What the getters and their `fetch*` variants pick, out of the member's roles sorted highest first.
const pick = {
  highest: (roles: readonly Role[]) => roles[0] ?? null,
  hoist: (roles: readonly Role[]) => roles.find((role) => role.hoist) ?? null,
  color: (roles: readonly Role[]) => roles.find((role) => role.colors.primaryColor !== 0) ?? null,
  icon: (roles: readonly Role[]) => roles.find((role) => role.icon ?? role.unicodeEmoji) ?? null,
  premiumSubscriberRole: (roles: readonly Role[]) =>
    roles.find((role) => role.tags?.premiumSubscriberRole) ?? null,
  botRole: (roles: readonly Role[], userId: string | null) =>
    (userId !== null && roles.find((role) => role.tags?.botId === userId)) || null,
};

function highestFirst(roles: Iterable<Role>): Role[] {
  return [...roles].toSorted((a, b) => b.comparePositionTo(a));
}

/**
 * Manages the roles of one {@link GuildMember}, like discord.js's `GuildMemberRoleManager`.
 *
 * @remarks
 * The one deliberate difference from discord.js: {@link GuildMemberRoleManager.cache} and the getters reading it
 * (`highest`, `hoist`, `color`, ...) are `Awaitable`, like `manager.cache.get`. They are synchronous with the default
 * in-memory cache and a promise with a remote store, so `await` works with both.
 *
 * They only know the roles the cache holds. The `fetch*` methods fall back to the API when a role is not cached.
 */
export class GuildMemberRoleManager extends BaseManager {
  /**
   * The member these roles belong to.
   */
  public readonly member: GuildMember;

  /**
   * @param member The member.
   */
  public constructor(member: GuildMember) {
    super(member.client);
    this.member = member;
  }

  /**
   * The member's guild, from the cache: `null` when it is not cached.
   */
  public get guild(): Guild | null {
    return this.member.guild;
  }

  public get guildId(): string {
    return this.member.guildId;
  }

  /**
   * The ID of the member's user.
   *
   * @throws {GatewayError} `GuildMemberUserUnknown` when the member's payload did not include its user.
   */
  public get userId(): string {
    const { id } = this.member;
    if (id === null) throw new GatewayError("GuildMemberUserUnknown");
    return id;
  }

  /**
   * The IDs of the member's roles, `@everyone` excluded.
   */
  public get ids(): readonly string[] {
    return this.member.roleIds;
  }

  /**
   * The member's roles held in the cache, by ID, `@everyone` included. Roles that are not cached are skipped: use
   * {@link GuildMemberRoleManager.fetch} to get them all.
   */
  public get cache(): Awaitable<Collection<Snowflake, Role>> {
    return cachedRoles(this.client, this.guildId, [...this.ids, this.guildId]);
  }

  /**
   * The member's highest cached role. `null` when none of their roles is cached, `@everyone` included.
   */
  public get highest(): Awaitable<Role | null> {
    return this.fromCache(pick.highest);
  }

  /**
   * The cached role the member is displayed under in the member list, if any.
   */
  public get hoist(): Awaitable<Role | null> {
    return this.fromCache(pick.hoist);
  }

  /**
   * The highest cached role giving the member a color, if any.
   */
  public get color(): Awaitable<Role | null> {
    return this.fromCache(pick.color);
  }

  /**
   * The highest cached role giving the member an icon, if any.
   */
  public get icon(): Awaitable<Role | null> {
    return this.fromCache(pick.icon);
  }

  /**
   * The server booster role, if the member has it and it is cached.
   */
  public get premiumSubscriberRole(): Awaitable<Role | null> {
    return this.fromCache(pick.premiumSubscriberRole);
  }

  /**
   * The role Discord manages for the member, when the member is a bot and the role is cached.
   */
  public get botRole(): Awaitable<Role | null> {
    return this.fromCache((roles) => pick.botRole(roles, this.member.id));
  }

  /**
   * Fetches the member's roles, `@everyone` included, highest first.
   */
  public async fetch(): Promise<Role[]> {
    const ids = [...this.ids, this.guildId];
    let roles = [...(await this.cache).values()];
    if (roles.length !== new Set(ids).size) {
      // One request for every role of the guild, rather than one per missing role.
      const wanted = new Set(ids);
      roles = (await this.client.roles.fetchAll(this.guildId)).filter((role) =>
        wanted.has(role.id),
      );
    }

    return highestFirst(roles);
  }

  /**
   * Fetches the member's highest role, `@everyone` when they have no other.
   *
   * @deprecated Use {@link GuildMemberRoleManager.highest}. When some of the member's roles may be missing from the
   * cache (a filtered cache, a `plugin-broker` worker), call {@link GuildMemberRoleManager.fetch} first, then read the
   * getter.
   */
  public async fetchHighest(): Promise<Role | null> {
    return pick.highest(await this.fetch());
  }

  /**
   * Fetches the role the member is displayed under in the member list, if any.
   *
   * @deprecated Use {@link GuildMemberRoleManager.hoist}. See {@link GuildMemberRoleManager.fetchHighest} for the
   * cache-miss fallback.
   */
  public async fetchHoist(): Promise<Role | null> {
    return pick.hoist(await this.fetch());
  }

  /**
   * Fetches the highest role giving the member a color, if any.
   *
   * @deprecated Use {@link GuildMemberRoleManager.color}. See {@link GuildMemberRoleManager.fetchHighest} for the
   * cache-miss fallback.
   */
  public async fetchColor(): Promise<Role | null> {
    return pick.color(await this.fetch());
  }

  /**
   * Fetches the highest role giving the member an icon, if any.
   *
   * @deprecated Use {@link GuildMemberRoleManager.icon}. See {@link GuildMemberRoleManager.fetchHighest} for the
   * cache-miss fallback.
   */
  public async fetchIcon(): Promise<Role | null> {
    return pick.icon(await this.fetch());
  }

  /**
   * Fetches the server booster role, if the member has it.
   *
   * @deprecated Use {@link GuildMemberRoleManager.premiumSubscriberRole}. See
   * {@link GuildMemberRoleManager.fetchHighest} for the cache-miss fallback.
   */
  public async fetchPremiumSubscriberRole(): Promise<Role | null> {
    return pick.premiumSubscriberRole(await this.fetch());
  }

  /**
   * Fetches the role Discord manages for the member, when the member is a bot.
   *
   * @deprecated Use {@link GuildMemberRoleManager.botRole}. See {@link GuildMemberRoleManager.fetchHighest} for the
   * cache-miss fallback.
   */
  public async fetchBotRole(): Promise<Role | null> {
    return pick.botRole(await this.fetch(), this.member.id);
  }

  /**
   * Adds a role, or several, to the member.
   *
   * @remarks
   * A single role goes through its own endpoint and resolves to a copy of the member with the role added. Several
   * roles replace the member's roles, like {@link GuildMemberRoleManager.set}.
   *
   * @param roleOrRoles The role or its ID, or an array or `Collection` of them.
   * @param reason The reason for the audit log.
   * @returns The updated member.
   */
  public async add(
    roleOrRoles: RoleResolvable | RoleResolvables,
    reason?: string,
  ): Promise<GuildMember> {
    if (isRoleResolvables(roleOrRoles)) {
      return this.set([...new Set([...this.ids, ...resolveRoleIds(roleOrRoles)])], reason);
    }

    const roleId = this.resolveSingle(roleOrRoles);
    await this.client.members.addRole(this.guildId, this.userId, roleId, reason);
    return this.member[kClone]({ roles: [...new Set([...this.ids, roleId])] });
  }

  /**
   * Removes a role, or several, from the member.
   *
   * @remarks
   * A single role goes through its own endpoint and resolves to a copy of the member with the role removed. Several
   * roles replace the member's roles, like {@link GuildMemberRoleManager.set}.
   *
   * @param roleOrRoles The role or its ID, or an array or `Collection` of them.
   * @param reason The reason for the audit log.
   * @returns The updated member.
   */
  public async remove(
    roleOrRoles: RoleResolvable | RoleResolvables,
    reason?: string,
  ): Promise<GuildMember> {
    if (isRoleResolvables(roleOrRoles)) {
      const removed = new Set(resolveRoleIds(roleOrRoles));
      return this.set(
        this.ids.filter((id) => !removed.has(id)),
        reason,
      );
    }

    const roleId = this.resolveSingle(roleOrRoles);
    await this.client.members.removeRole(this.guildId, this.userId, roleId, reason);
    return this.member[kClone]({ roles: this.ids.filter((id) => id !== roleId) });
  }

  /**
   * Replaces the member's roles.
   *
   * @param roles The roles the member ends up with: an array of roles or IDs, or a `Collection` of roles.
   * @param reason The reason for the audit log.
   * @returns The member, patched.
   */
  public set(roles: RoleResolvables, reason?: string): Promise<GuildMember> {
    return this.member.edit({ roles, reason });
  }

  /**
   * Creates another manager of the same member's roles.
   */
  public clone(): GuildMemberRoleManager {
    return new GuildMemberRoleManager(this.member);
  }

  private fromCache<Picked>(picker: (roles: readonly Role[]) => Picked): Awaitable<Picked> {
    return whenAll([this.cache], ([cache]) => picker(highestFirst(cache.values())));
  }

  private resolveSingle(role: RoleResolvable): string {
    const roleId = resolveRoleId(role);
    if (roleId === null) {
      throw new GatewayTypeError(
        "InvalidType",
        "roles",
        "Role, Snowflake or Array or Collection of Roles or Snowflakes",
      );
    }

    return roleId;
  }
}
