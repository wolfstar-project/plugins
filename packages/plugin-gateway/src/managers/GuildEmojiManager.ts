import { emojiKey, type CacheEntityTypes } from "@wolfstar/plugin-cache";
import {
  Routes,
  type APIEmoji,
  type RESTPatchAPIGuildEmojiJSONBody,
  type RESTPostAPIGuildEmojiJSONBody,
} from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import { GuildEmoji } from "../structures/GuildEmoji.js";
import type { User } from "../structures/User.js";
import { container } from "../util/container.js";
import { CachedManager } from "./CachedManager.js";

/**
 * The options to create an emoji with.
 */
export interface GuildEmojiCreateOptions {
  /**
   * The image, as a data URI (`data:image/png;base64,...`), up to 256 KiB.
   */
  attachment: string;
  name: string;
  /**
   * The IDs of the roles allowed to use the emoji, everyone when omitted.
   */
  roles?: readonly string[];
  reason?: string;
}

/**
 * The options to edit an emoji with.
 */
export interface GuildEmojiEditOptions {
  name?: string;
  /**
   * The IDs of the roles allowed to use the emoji, `null` or empty for everyone.
   */
  roles?: readonly string[] | null;
  reason?: string;
}

/**
 * Manages the custom emojis of one guild.
 */
export class GuildEmojiManager extends CachedManager<"emojis", GuildEmoji, [emojiId: string]> {
  /**
   * The ID of the guild.
   */
  public readonly guildId: string;

  public constructor(client: GatewayClient, guildId: string) {
    super(client, "emojis");
    this.guildId = guildId;
  }

  public createStructure(data: CacheEntityTypes["emojis"]): GuildEmoji {
    return new GuildEmoji(data);
  }

  public resolveKey(emojiId: string): string {
    return emojiKey(this.guildId, emojiId);
  }

  /**
   * Fetches every emoji of the guild, and caches them.
   */
  public async fetchAll(): Promise<GuildEmoji[]> {
    const emojis = (await container.rest.get(Routes.guildEmojis(this.guildId))) as APIEmoji[];
    return Promise.all(emojis.map((emoji) => this.store(emoji)));
  }

  /**
   * Uploads an emoji.
   *
   * @param options The image, name, and allowed roles.
   */
  public async create(options: GuildEmojiCreateOptions): Promise<GuildEmoji> {
    const body: RESTPostAPIGuildEmojiJSONBody = {
      image: options.attachment,
      name: options.name,
      roles: options.roles ? [...options.roles] : undefined,
    };
    const emoji = (await container.rest.post(Routes.guildEmojis(this.guildId), {
      body,
      reason: options.reason,
    })) as APIEmoji;
    return this.store(emoji);
  }

  /**
   * Edits an emoji.
   *
   * @param emojiId The ID of the emoji.
   * @param options The changes to apply.
   */
  public async edit(emojiId: string, options: GuildEmojiEditOptions): Promise<GuildEmoji> {
    const body: RESTPatchAPIGuildEmojiJSONBody = {
      name: options.name,
      roles:
        options.roles === undefined || options.roles === null ? options.roles : [...options.roles],
    };
    const emoji = (await container.rest.patch(Routes.guildEmoji(this.guildId, emojiId), {
      body,
      reason: options.reason,
    })) as APIEmoji;
    return this.store(emoji);
  }

  /**
   * Deletes an emoji.
   *
   * @param emojiId The ID of the emoji.
   * @param reason The reason for the audit log.
   */
  public async delete(emojiId: string, reason?: string): Promise<void> {
    await container.rest.delete(Routes.guildEmoji(this.guildId, emojiId), { reason });
    await this.cache?.delete(this.resolveKey(emojiId));
  }

  /**
   * Fetches the user who uploaded an emoji, which the API only returns with `ManageGuildExpressions`.
   *
   * @param emojiId The ID of the emoji.
   */
  public async fetchAuthor(emojiId: string): Promise<User | null> {
    const emoji = await this.fetch(emojiId, { force: true });
    return emoji.author;
  }

  /**
   * Lists the emojis of the guild held in the cache, without calling the API.
   *
   * @remarks
   * It enumerates the whole entity cache, which a Redis store answers from its index: prefer `fetchAll` when the
   * cache may be incomplete.
   */
  public async listCached(): Promise<GuildEmoji[]> {
    const cache = this.cache;
    if (!cache) return [];

    const prefix = `${this.guildId}:`;
    const keys = (await cache.keys()).filter((key) => key.startsWith(prefix));
    const values = await Promise.all(keys.map((key) => cache.get(key)));
    return values
      .filter((value) => value !== undefined)
      .map((value) => this.createStructure(value));
  }

  protected async fetchRaw(emojiId: string) {
    const emoji = (await container.rest.get(Routes.guildEmoji(this.guildId, emojiId))) as APIEmoji;
    return { ...emoji, guild_id: this.guildId };
  }

  private async store(emoji: APIEmoji): Promise<GuildEmoji> {
    const raw = { ...emoji, guild_id: this.guildId };
    await this.cache?.set(this.resolveKey(emoji.id!), raw);
    if (emoji.user) await this.client.cache?.users.set(emoji.user.id, emoji.user);
    return this.createStructure(raw);
  }
}
