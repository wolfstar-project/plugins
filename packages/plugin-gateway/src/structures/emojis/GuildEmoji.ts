import { cachedGuild, cacheRead, whenAll, type CacheRead } from "../../util/cache.js";
import { requireMe } from "../../util/permissions.js";
import type { CacheEntityTypes } from "@wolfstar/plugin-cache";
import type { GuildEmojiEditOptions } from "../../managers/GuildEmojiManager.js";
import { GuildEmojiRoleManager } from "../../managers/GuildEmojiRoleManager.js";
import { Emoji } from "./Emoji.js";
import type { Guild } from "../guilds/Guild.js";
import { kData, kPatch, kRelations } from "../Structure.js";
import { User } from "../users/User.js";

/**
 * The relations of a {@link GuildEmoji}, resolved from the cache by the guild's emoji manager.
 */
export interface GuildEmojiRelations {
  author?: User;
  guild?: Guild | null;
}

/**
 * A custom emoji of a guild.
 */
export class GuildEmoji extends Emoji<CacheEntityTypes["emojis"], GuildEmojiRelations> {
  /**
   * @param data The raw emoji.
   * @param relations The uploader and guild as resolved from the cache, by the guild's emoji manager.
   */
  public constructor(data: CacheEntityTypes["emojis"], relations: GuildEmojiRelations = {}) {
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
   * The guild, from the cache. `null` when the guild is not cached, or when the cache is asynchronous: use
   * `fetchGuild()` to always get it.
   */
  public get guild(): Guild | null {
    return this.lazyRelation("guild", (client) => cachedGuild(client, this[kData].guild_id));
  }

  /**
   * Fetches the guild, cache first.
   */
  public fetchGuild(): Promise<Guild> {
    return this.client.guilds.fetch(this.guildId);
  }

  /**
   * Whether the emoji is managed by an integration, e.g. Twitch.
   */
  public override get managed(): boolean {
    return this[kData].managed ?? false;
  }

  public get requiresColons(): boolean {
    return this[kData].require_colons ?? true;
  }

  /**
   * Whether the emoji can be used, `false` when the guild lost the boosts it needs.
   */
  public override get available(): boolean {
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
    return new GuildEmojiRoleManager(this);
  }

  /**
   * The user who uploaded the emoji, when the payload includes it (it needs `ManageGuildExpressions`).
   */
  public get author(): User | null {
    const { user } = this[kData];
    return this[kRelations].author ?? (user ? new User(user) : null);
  }

  /**
   * Whether the bot can delete the emoji, like discord.js's `GuildEmoji#deletable`: it is not managed, and the bot
   * has `ManageGuildExpressions`.
   *
   * @throws A `GatewayError`: `GuildUncachedMe` or `GuildUncached` on a cache miss.
   */
  public get deletable(): CacheRead<boolean> {
    if (this.managed) return cacheRead(false);
    return cacheRead(
      whenAll([requireMe(this.client, this.guildId)], ([me]) =>
        whenAll([me.permissions], ([permissions]) => permissions.has("ManageGuildExpressions")),
      ),
    );
  }

  /**
   * Whether the bot can delete the emoji: it is not managed, and the bot has `ManageGuildExpressions`.
   *
   * @deprecated Use {@link GuildEmoji.deletable}. When the guild or the bot's member may be missing from the cache (a
   * filtered cache, a `plugin-broker` worker), fetch them first (`client.members.fetchMe(guildId)`), then read the
   * getter.
   */
  public async fetchDeletable(): Promise<boolean> {
    if (this.managed) return false;
    const me = await this.client.members.fetchMe(this.guildId);
    return (await me.fetchPermissions()).has("ManageGuildExpressions");
  }

  /**
   * Fetches the user who uploaded the emoji.
   */
  public fetchAuthor(): Promise<User | null> {
    return this.client.guilds.emojis(this.guildId).fetchAuthor(this.id);
  }

  public async edit(options: GuildEmojiEditOptions): Promise<this> {
    const emoji = await this.client.guilds.emojis(this.guildId).edit(this.id, options);
    return this[kPatch](emoji.toJSON());
  }

  public setName(name: string, reason?: string): Promise<this> {
    return this.edit({ name, reason });
  }

  public async delete(reason?: string): Promise<this> {
    await this.client.guilds.emojis(this.guildId).delete(this.id, reason);
    return this;
  }

  /**
   * Whether this emoji has the same data as another one, like discord.js's `GuildEmoji#equals`. Against an emoji, it
   * compares the ID, name, `managed`, `available`, `requiresColons`, and roles; against a raw emoji, only the ID,
   * name, and roles. `false` for anything else.
   *
   * @param other The emoji, or raw emoji, to compare with.
   */
  public equals(other: unknown): boolean {
    const roleIds = this.roleIds;
    if (other instanceof GuildEmoji) {
      return (
        other.id === this.id &&
        other.name === this.name &&
        other.managed === this.managed &&
        other.available === this.available &&
        other.requiresColons === this.requiresColons &&
        other.roleIds.length === roleIds.length &&
        other.roleIds.every((id) => roleIds.includes(id))
      );
    }

    if (typeof other !== "object" || other === null) return false;
    const raw = other as Partial<CacheEntityTypes["emojis"]>;
    const roles = raw.roles ?? [];
    return (
      raw.id === this.id &&
      raw.name === this.name &&
      roles.length === roleIds.length &&
      roles.every((id) => roleIds.includes(id))
    );
  }
}
