import { emojiKey, type Awaitable, type CacheEntityTypes } from "@wolfstar/plugin-cache";
import {
  type APIEmoji,
  type RESTPatchAPIGuildEmojiJSONBody,
  type RESTPostAPIGuildEmojiJSONBody,
} from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import { GuildEmoji } from "../structures/emojis/GuildEmoji.js";
import {
  ReactionEmoji,
  type EmojiIdentifierResolvable,
} from "../structures/emojis/ReactionEmoji.js";
import type { User } from "../structures/users/User.js";
import { whenAll } from "../util/cache.js";
import { CachedManager, type AddOptions } from "./CachedManager.js";
import { resolveImage, type ImageResolvable } from "../util/DataResolver.js";
import { resolveRoleIds, type RoleResolvables } from "../util/roles.js";

const EmojiIdPattern = /^\d{17,20}$/;

/**
 * The options to create an emoji with.
 */
export interface GuildEmojiCreateOptions {
  /**
   * The image, up to 256 KiB: a data URI (`data:image/png;base64,...`), its contents, a path, a URL, a stream, or a
   * blob.
   */
  attachment: ImageResolvable;
  name: string;
  /**
   * The roles allowed to use the emoji, everyone when omitted: an array of roles or IDs, or a `Collection` of roles.
   */
  roles?: RoleResolvables;
  reason?: string;
}

/**
 * The options to edit an emoji with.
 */
export interface GuildEmojiEditOptions {
  name?: string;
  /**
   * The roles allowed to use the emoji, `null` or empty for everyone: an array of roles or IDs, or a `Collection`
   * of roles.
   */
  roles?: RoleResolvables | null;
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

  protected createStructure(data: CacheEntityTypes["emojis"]): GuildEmoji {
    return new GuildEmoji(data);
  }

  public keyOf(data: CacheEntityTypes["emojis"]): string {
    return this.resolveKey(data.id!);
  }

  /**
   * Adds an emoji to the cache, and its uploader to `client.users`.
   *
   * @internal
   */
  public override async _add(
    data: CacheEntityTypes["emojis"],
    cache = true,
    options?: AddOptions,
  ): Promise<GuildEmoji> {
    if (data.user) await this.client.users._add(data.user, cache);
    return super._add(data, cache, options);
  }

  public override _hydrate(data: CacheEntityTypes["emojis"]): Awaitable<GuildEmoji> {
    return whenAll(
      [
        data.user ? this.client.users._resolveData(data.user) : undefined,
        this.cachedGuild(data.guild_id),
      ],
      ([author, guild]) => new GuildEmoji(data, { author, guild }),
    );
  }

  public resolveKey(emojiId: string): string {
    return emojiKey(this.guildId, emojiId);
  }

  /**
   * Resolves an emoji of the guild, or anything identifying one, to the identifier reaction routes expect, like
   * discord.js's `resolveIdentifier`.
   *
   * @param emoji An emoji, its ID, or anything {@link EmojiIdentifierResolvable}.
   * @returns The identifier, `null` when an ID is not a cached emoji of this guild.
   */
  public resolveIdentifier(emoji: EmojiIdentifierResolvable): Awaitable<string | null> {
    if (emoji instanceof GuildEmoji) return emoji.identifier;
    if (typeof emoji === "string" && EmojiIdPattern.test(emoji)) {
      return whenAll(
        [this.cache.get(this.resolveKey(emoji))],
        ([cached]) => cached?.identifier ?? null,
      );
    }
    return ReactionEmoji.resolveIdentifier(emoji);
  }

  /**
   * Fetches every emoji of the guild, and caches them.
   */
  public async fetchAll(): Promise<GuildEmoji[]> {
    const emojis = await this.client.api.guilds.getEmojis(this.guildId);
    return Promise.all(emojis.map((emoji) => this.store(emoji)));
  }

  /**
   * Uploads an emoji.
   *
   * @param options The image, name, and allowed roles.
   */
  public async create(options: GuildEmojiCreateOptions): Promise<GuildEmoji> {
    const body: RESTPostAPIGuildEmojiJSONBody = {
      image: (await resolveImage(options.attachment))!,
      name: options.name,
      roles: options.roles ? resolveRoleIds(options.roles) : undefined,
    };
    const emoji = await this.client.api.guilds.createEmoji(this.guildId, body, {
      reason: options.reason,
    });
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
        options.roles === undefined || options.roles === null
          ? options.roles
          : resolveRoleIds(options.roles),
    };
    const emoji = await this.client.api.guilds.editEmoji(this.guildId, emojiId, body, {
      reason: options.reason,
    });
    return this.store(emoji);
  }

  /**
   * Deletes an emoji.
   *
   * @param emojiId The ID of the emoji.
   * @param reason The reason for the audit log.
   */
  public async delete(emojiId: string, reason?: string): Promise<void> {
    await this.client.api.guilds.deleteEmoji(this.guildId, emojiId, { reason });
    await this.cache.delete(this.resolveKey(emojiId));
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
   *
   * @returns The cached entries, `[]` when this entity is not cached.
   * @throws {TypeError} When the store cannot enumerate its entries.
   */
  public async listCached(): Promise<GuildEmoji[]> {
    const cache = this.iterableCache();
    if (!cache) return [];

    const prefix = `${this.guildId}:`;
    const keys = await this.guard("keys", null, () => cache.keys(), []);
    const values = await Promise.all(
      keys
        .filter((key) => key.startsWith(prefix))
        .map((key) => this.guard("get", key, () => cache.get(key), undefined)),
    );
    return Promise.all(
      values.filter((value) => value !== undefined).map((value) => this._build(value)),
    );
  }

  protected async fetchRaw(emojiId: string) {
    const emoji = await this.client.api.guilds.getEmoji(this.guildId, emojiId);
    return { ...emoji, guild_id: this.guildId };
  }

  private store(emoji: APIEmoji): Promise<GuildEmoji> {
    return this._add({ ...emoji, guild_id: this.guildId });
  }
}
