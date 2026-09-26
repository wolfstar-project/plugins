import type { CacheEntityTypes } from "@wolfstar/plugin-cache";
import type { GuildEmojiEditOptions } from "../managers/GuildEmojiManager.js";
import { GuildEmojiRoleManager } from "../managers/GuildEmojiRoleManager.js";
import { getGatewayClient } from "../util/container.js";
import { Emoji } from "./Emoji.js";
import type { Guild } from "./Guild.js";
import { kData, kPatch, kRelations } from "./Structure.js";
import { User } from "./User.js";

/**
 * A custom emoji of a guild.
 */
export class GuildEmoji extends Emoji<CacheEntityTypes["emojis"]> {
  declare public [kRelations]: { author?: User; guild?: Guild | null };

  /**
   * @param data The raw emoji.
   * @param relations The uploader and guild as resolved from the cache, by the guild's emoji manager.
   */
  public constructor(
    data: CacheEntityTypes["emojis"],
    relations: { author?: User; guild?: Guild | null } = {},
  ) {
    super(data, relations);
  }

  public override [kPatch](data: Readonly<Partial<CacheEntityTypes["emojis"]>>): this {
    if (data.user) this.dropRelations("author");
    return super[kPatch](data);
  }

  public override get id(): string {
    return this[kData].id!;
  }

  public get guildId() {
    return this[kData].guild_id;
  }

  /**
   * The guild, from the cache. `null` when the guild is not cached, or when the emoji was not built by a manager: use
   * `fetchGuild()` to always get it.
   */
  public get guild(): Guild | null {
    return this[kRelations].guild ?? null;
  }

  /**
   * Fetches the guild, cache first.
   */
  public fetchGuild(): Promise<Guild> {
    return getGatewayClient().guilds.fetch(this.guildId);
  }

  /**
   * Whether the emoji is managed by an integration, e.g. Twitch.
   */
  public get managed(): boolean {
    return this[kData].managed ?? false;
  }

  public get requiresColons(): boolean {
    return this[kData].require_colons ?? true;
  }

  /**
   * Whether the emoji can be used, `false` when the guild lost the boosts it needs.
   */
  public get available(): boolean {
    return this[kData].available ?? true;
  }

  /**
   * The IDs of the roles allowed to use the emoji, everyone when empty.
   */
  public get roleIds(): readonly string[] {
    return this[kData].roles ?? [];
  }

  /**
   * The roles allowed to use the emoji.
   */
  public get roles(): GuildEmojiRoleManager {
    return new GuildEmojiRoleManager(getGatewayClient(), this.guildId, this.id, this.roleIds);
  }

  /**
   * The user who uploaded the emoji, when the payload includes it (it needs `ManageGuildExpressions`).
   */
  public get author(): User | null {
    const { user } = this[kData];
    return this[kRelations].author ?? (user ? new User(user) : null);
  }

  /**
   * Whether the bot can delete the emoji: it is not managed, and the bot has `ManageGuildExpressions`.
   */
  public async fetchDeletable(): Promise<boolean> {
    if (this.managed) return false;
    const me = await getGatewayClient().members.fetchMe(this.guildId);
    return (await me.fetchPermissions()).has("ManageGuildExpressions");
  }

  /**
   * Fetches the user who uploaded the emoji.
   */
  public fetchAuthor(): Promise<User | null> {
    return getGatewayClient().guilds.emojis(this.guildId).fetchAuthor(this.id);
  }

  public async edit(options: GuildEmojiEditOptions): Promise<this> {
    const emoji = await getGatewayClient().guilds.emojis(this.guildId).edit(this.id, options);
    return this[kPatch](emoji.toJSON());
  }

  public setName(name: string, reason?: string): Promise<this> {
    return this.edit({ name, reason });
  }

  public async delete(reason?: string): Promise<this> {
    await getGatewayClient().guilds.emojis(this.guildId).delete(this.id, reason);
    return this;
  }

  /**
   * Whether this emoji has the same data as another one.
   * @param emoji The emoji to compare with.
   */
  public equals(emoji: GuildEmoji): boolean {
    return (
      this.id === emoji.id &&
      this.name === emoji.name &&
      this.managed === emoji.managed &&
      this.available === emoji.available &&
      this.requiresColons === emoji.requiresColons &&
      this.roleIds.length === emoji.roleIds.length &&
      this.roleIds.every((id) => emoji.roleIds.includes(id))
    );
  }
}
