import type { Collection } from "@discordjs/collection";
import type { Awaitable } from "@wolfstar/plugin-cache";
import type { Snowflake } from "discord-api-types/v10";
import type { GuildEmoji } from "../structures/emojis/GuildEmoji.js";
import type { Guild } from "../structures/guilds/Guild.js";
import type { Role } from "../structures/guilds/Role.js";
import type { RoleResolvable } from "../types.js";
import {
  cachedRoles,
  isRoleResolvables,
  resolveRoleIds,
  type RoleResolvables,
} from "../util/roles.js";
import { BaseManager } from "./BaseManager.js";

/**
 * Manages the roles allowed to use one custom emoji, like discord.js's `GuildEmojiRoleManager`. When it has none,
 * everyone can use it.
 *
 * @remarks
 * {@link GuildEmojiRoleManager.cache} is `Awaitable`, unlike discord.js's: synchronous with the default in-memory
 * cache, a promise with a remote store.
 */
export class GuildEmojiRoleManager extends BaseManager {
  /**
   * The emoji these roles belong to.
   */
  public readonly emoji: GuildEmoji;

  /**
   * @param emoji The emoji.
   */
  public constructor(emoji: GuildEmoji) {
    super(emoji.client);
    this.emoji = emoji;
  }

  /**
   * The emoji's guild, from the cache: `null` when it is not cached.
   */
  public get guild(): Guild | null {
    return this.emoji.guild;
  }

  public get guildId(): string {
    return this.emoji.guildId;
  }

  public get emojiId(): string {
    return this.emoji.id;
  }

  /**
   * The IDs of the allowed roles.
   */
  public get ids(): readonly string[] {
    return this.emoji.roleIds;
  }

  /**
   * The allowed roles held in the cache, by ID. Roles that are not cached are skipped: use
   * {@link GuildEmojiRoleManager.fetch} to get them all.
   */
  public get cache(): Awaitable<Collection<Snowflake, Role>> {
    return cachedRoles(this.client, this.guildId, this.ids);
  }

  /**
   * Fetches the allowed roles, cache first.
   */
  public fetch(): Promise<Role[]> {
    return Promise.all(this.ids.map((id) => this.client.roles.fetch(this.guildId, id)));
  }

  /**
   * Allows more roles to use the emoji.
   *
   * @param roleOrRoles The role or its ID, or an array or `Collection` of them.
   * @returns The emoji, patched.
   */
  public async add(roleOrRoles: RoleResolvable | RoleResolvables): Promise<GuildEmoji> {
    return this.set([...new Set([...this.ids, ...this.resolve(roleOrRoles)])]);
  }

  /**
   * Stops allowing roles to use the emoji.
   *
   * @param roleOrRoles The role or its ID, or an array or `Collection` of them.
   * @returns The emoji, patched.
   */
  public async remove(roleOrRoles: RoleResolvable | RoleResolvables): Promise<GuildEmoji> {
    const removed = new Set(this.resolve(roleOrRoles));
    return this.set(this.ids.filter((id) => !removed.has(id)));
  }

  /**
   * Replaces the allowed roles, everyone when empty.
   *
   * @param roles The roles: an array of roles or IDs, or a `Collection` of roles.
   * @returns The emoji, patched.
   */
  public set(roles: RoleResolvables): Promise<GuildEmoji> {
    return this.emoji.edit({ roles });
  }

  /**
   * Creates another manager of the same emoji's roles.
   */
  public clone(): GuildEmojiRoleManager {
    return new GuildEmojiRoleManager(this.emoji);
  }

  private resolve(roleOrRoles: RoleResolvable | RoleResolvables): string[] {
    return resolveRoleIds(isRoleResolvables(roleOrRoles) ? roleOrRoles : [roleOrRoles]);
  }
}
