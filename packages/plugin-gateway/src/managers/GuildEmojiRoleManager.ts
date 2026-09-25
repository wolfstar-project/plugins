import type { GatewayClient } from "../GatewayClient.js";
import type { GuildEmoji } from "../structures/GuildEmoji.js";
import type { Role } from "../structures/Role.js";

/**
 * Manages the roles allowed to use one custom emoji. When it has none, everyone can use it.
 */
export class GuildEmojiRoleManager {
  public readonly client: GatewayClient;
  public readonly guildId: string;
  public readonly emojiId: string;

  readonly #roleIds: readonly string[];

  public constructor(
    client: GatewayClient,
    guildId: string,
    emojiId: string,
    roleIds: readonly string[],
  ) {
    this.client = client;
    this.guildId = guildId;
    this.emojiId = emojiId;
    this.#roleIds = roleIds;
  }

  /**
   * The IDs of the allowed roles.
   */
  public get ids(): readonly string[] {
    return this.#roleIds;
  }

  /**
   * Fetches the allowed roles, cache first.
   */
  public fetch(): Promise<Role[]> {
    return Promise.all(this.#roleIds.map((id) => this.client.roles.fetch(this.guildId, id)));
  }

  /**
   * Allows more roles to use the emoji.
   *
   * @param roles The ID of the role, or several IDs.
   */
  public add(roles: string | readonly string[]): Promise<GuildEmoji> {
    const added = typeof roles === "string" ? [roles] : roles;
    return this.set([...new Set([...this.#roleIds, ...added])]);
  }

  /**
   * Stops allowing roles to use the emoji.
   *
   * @param roles The ID of the role, or several IDs.
   */
  public remove(roles: string | readonly string[]): Promise<GuildEmoji> {
    const removed = new Set(typeof roles === "string" ? [roles] : roles);
    return this.set(this.#roleIds.filter((id) => !removed.has(id)));
  }

  /**
   * Replaces the allowed roles, everyone when empty.
   *
   * @param roles The IDs of the roles.
   */
  public set(roles: readonly string[]): Promise<GuildEmoji> {
    return this.client.guilds.emojis(this.guildId).edit(this.emojiId, { roles });
  }
}
