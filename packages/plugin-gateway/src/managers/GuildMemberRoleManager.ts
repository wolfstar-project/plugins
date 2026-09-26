import type { GatewayClient } from "../GatewayClient.js";
import type { Role } from "../structures/Role.js";

/**
 * Manages the roles of one {@link GuildMember}, reading them through the client's role manager.
 *
 * @remarks
 * discord.js's synchronous `member.roles.cache`, `highest`, `color`, ... become the `fetch*` methods here: the roles
 * are read from the (possibly asynchronous) cache, falling back to the API.
 */
export class GuildMemberRoleManager {
  public readonly client: GatewayClient;
  public readonly guildId: string;
  public readonly userId: string;

  readonly #roleIds: readonly string[];

  /**
   * @param client The client.
   * @param guildId The ID of the guild.
   * @param userId The ID of the member's user.
   * @param roleIds The IDs of the member's roles, as known to the member structure.
   */
  public constructor(
    client: GatewayClient,
    guildId: string,
    userId: string,
    roleIds: readonly string[],
  ) {
    this.client = client;
    this.guildId = guildId;
    this.userId = userId;
    this.#roleIds = roleIds;
  }

  /**
   * The IDs of the member's roles, `@everyone` excluded.
   */
  public get ids(): readonly string[] {
    return this.#roleIds;
  }

  /**
   * Fetches the member's roles, `@everyone` included, highest first.
   */
  public async fetch(): Promise<Role[]> {
    const ids = [...this.#roleIds, this.guildId];
    const roles = await Promise.all(ids.map((id) => this.client.roles.fetch(this.guildId, id)));
    return roles.toSorted((a, b) => b.comparePositionTo(a));
  }

  /**
   * Fetches the member's highest role, `@everyone` when they have no other.
   */
  public async fetchHighest(): Promise<Role | null> {
    return (await this.fetch())[0] ?? null;
  }

  /**
   * Fetches the role the member is displayed under in the member list, if any.
   */
  public async fetchHoist(): Promise<Role | null> {
    return (await this.fetch()).find((role) => role.hoist) ?? null;
  }

  /**
   * Fetches the highest role giving the member a color, if any.
   */
  public async fetchColor(): Promise<Role | null> {
    return (await this.fetch()).find((role) => role.color !== 0) ?? null;
  }

  /**
   * Fetches the highest role giving the member an icon, if any.
   */
  public async fetchIcon(): Promise<Role | null> {
    return (await this.fetch()).find((role) => role.icon ?? role.unicodeEmoji) ?? null;
  }

  /**
   * Fetches the server booster role, if the member has it.
   */
  public async fetchPremiumSubscriberRole(): Promise<Role | null> {
    return (await this.fetch()).find((role) => role.tags?.premium_subscriber === null) ?? null;
  }

  /**
   * Fetches the role Discord manages for the member, when the member is a bot.
   */
  public async fetchBotRole(): Promise<Role | null> {
    return (await this.fetch()).find((role) => role.tags?.bot_id === this.userId) ?? null;
  }

  /**
   * Adds roles to the member.
   *
   * @param roles The ID of the role, or several IDs.
   * @param reason The reason for the audit log.
   */
  public async add(roles: string | readonly string[], reason?: string) {
    if (typeof roles === "string") {
      return this.client.members.addRole(this.guildId, this.userId, roles, reason);
    }

    return this.set([...new Set([...this.#roleIds, ...roles])], reason);
  }

  /**
   * Removes roles from the member.
   *
   * @param roles The ID of the role, or several IDs.
   * @param reason The reason for the audit log.
   */
  public async remove(roles: string | readonly string[], reason?: string) {
    if (typeof roles === "string") {
      return this.client.members.removeRole(this.guildId, this.userId, roles, reason);
    }

    const removed = new Set(roles);
    return this.set(
      this.#roleIds.filter((id) => !removed.has(id)),
      reason,
    );
  }

  /**
   * Replaces the member's roles.
   *
   * @param roles The IDs of the roles the member ends up with.
   * @param reason The reason for the audit log.
   */
  public set(roles: readonly string[], reason?: string) {
    return this.client.members.edit(this.guildId, this.userId, { roles, reason });
  }
}
