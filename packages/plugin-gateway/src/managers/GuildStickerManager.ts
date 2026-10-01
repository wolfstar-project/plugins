import type { RawFile } from "@discordjs/rest";
import { stickerKey, type Awaitable, type CacheEntityTypes } from "@wolfstar/plugin-cache";
import { type APISticker, type RESTPatchAPIGuildStickerJSONBody } from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import { Sticker } from "../structures/stickers/Sticker.js";
import type { User } from "../structures/users/User.js";
import { whenAll } from "../util/cache.js";
import { CachedManager, type AddOptions } from "./CachedManager.js";

/**
 * The options to upload a sticker with.
 */
export interface GuildStickerCreateOptions {
  /**
   * The PNG, APNG, GIF, or Lottie JSON file, up to 512 KiB.
   */
  file: RawFile;
  name: string;
  /**
   * The name of the Unicode emoji the sticker relates to, used for suggestions.
   */
  tags: string;
  description?: string;
  reason?: string;
}

/**
 * The options to edit a sticker with.
 */
export interface GuildStickerEditOptions {
  name?: string;
  description?: string | null;
  tags?: string;
  reason?: string;
}

/**
 * Manages the custom stickers of one guild.
 */
export class GuildStickerManager extends CachedManager<"stickers", Sticker, [stickerId: string]> {
  /**
   * The ID of the guild.
   */
  public readonly guildId: string;

  public constructor(client: GatewayClient, guildId: string) {
    super(client, "stickers");
    this.guildId = guildId;
  }

  protected createStructure(data: CacheEntityTypes["stickers"]): Sticker {
    return new Sticker(data);
  }

  public keyOf(data: CacheEntityTypes["stickers"]): string {
    return this.resolveKey(data.id);
  }

  /**
   * Adds a sticker to the cache, and its uploader to `client.users`.
   *
   * @internal
   */
  public override async _add(
    data: CacheEntityTypes["stickers"],
    cache = true,
    options?: AddOptions,
  ): Promise<Sticker> {
    if (data.user) await this.client.users._add(data.user, cache);
    return super._add(data, cache, options);
  }

  public override _hydrate(data: CacheEntityTypes["stickers"]): Awaitable<Sticker> {
    return whenAll(
      [
        data.user ? this.client.users._resolveData(data.user) : undefined,
        this.cachedGuild(data.guild_id),
      ],
      ([user, guild]) => new Sticker(data, { user, guild }),
    );
  }

  public resolveKey(stickerId: string): string {
    return stickerKey(this.guildId, stickerId);
  }

  /**
   * Fetches every sticker of the guild, and caches them.
   */
  public async fetchAll(): Promise<Sticker[]> {
    const stickers = await this.client.api.guilds.getStickers(this.guildId);
    return Promise.all(stickers.map((sticker) => this.store(sticker)));
  }

  /**
   * Uploads a sticker.
   *
   * @param options The file, name, and tags.
   */
  public async create(options: GuildStickerCreateOptions): Promise<Sticker> {
    const sticker = await this.client.api.guilds.createSticker(
      this.guildId,
      {
        name: options.name,
        tags: options.tags,
        description: options.description ?? "",
        file: options.file,
      },
      { reason: options.reason },
    );
    return this.store(sticker);
  }

  /**
   * Edits a sticker.
   *
   * @param stickerId The ID of the sticker.
   * @param options The changes to apply.
   */
  public async edit(stickerId: string, options: GuildStickerEditOptions): Promise<Sticker> {
    const body: RESTPatchAPIGuildStickerJSONBody = {
      name: options.name,
      description: options.description,
      tags: options.tags,
    };
    const sticker = await this.client.api.guilds.editSticker(this.guildId, stickerId, body, {
      reason: options.reason,
    });
    return this.store(sticker);
  }

  /**
   * Deletes a sticker.
   *
   * @param stickerId The ID of the sticker.
   * @param reason The reason for the audit log.
   */
  public async delete(stickerId: string, reason?: string): Promise<void> {
    await this.client.api.guilds.deleteSticker(this.guildId, stickerId, { reason });
    await this.cache.delete(this.resolveKey(stickerId));
  }

  /**
   * Fetches the user who uploaded a sticker, which the API only returns with `ManageGuildExpressions`.
   *
   * @param stickerId The ID of the sticker.
   */
  public async fetchUser(stickerId: string): Promise<User | null> {
    const sticker = await this.fetch(stickerId, { force: true });
    return sticker.user;
  }

  /**
   * Lists the stickers of the guild held in the cache, without calling the API.
   *
   * @remarks
   * It enumerates the whole entity cache, which a Redis store answers from its index: prefer `fetchAll` when the
   * cache may be incomplete.
   *
   * @returns The cached entries, `[]` when this entity is not cached.
   * @throws {TypeError} When the store cannot enumerate its entries.
   */
  public async listCached(): Promise<Sticker[]> {
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

  protected async fetchRaw(stickerId: string) {
    const sticker = await this.client.api.guilds.getSticker(this.guildId, stickerId);
    return { ...sticker, guild_id: this.guildId };
  }

  private store(sticker: APISticker): Promise<Sticker> {
    return this._add({ ...sticker, guild_id: this.guildId });
  }
}
