import type { RawFile } from "@discordjs/rest";
import { stickerKey, type CacheEntityTypes } from "@wolfstar/plugin-cache";
import {
  Routes,
  type APISticker,
  type RESTPatchAPIGuildStickerJSONBody,
} from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import { Sticker } from "../structures/Sticker.js";
import type { User } from "../structures/User.js";
import { container } from "../util/container.js";
import { CachedManager } from "./CachedManager.js";

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

  public createStructure(data: CacheEntityTypes["stickers"]): Sticker {
    return new Sticker(data);
  }

  public resolveKey(stickerId: string): string {
    return stickerKey(this.guildId, stickerId);
  }

  /**
   * Fetches every sticker of the guild, and caches them.
   */
  public async fetchAll(): Promise<Sticker[]> {
    const stickers = (await container.rest.get(Routes.guildStickers(this.guildId))) as APISticker[];
    return Promise.all(stickers.map((sticker) => this.store(sticker)));
  }

  /**
   * Uploads a sticker.
   *
   * @param options The file, name, and tags.
   */
  public async create(options: GuildStickerCreateOptions): Promise<Sticker> {
    // The endpoint takes a multipart form whose fields are the body's keys, next to the `file`.
    const sticker = (await container.rest.post(Routes.guildStickers(this.guildId), {
      appendToFormData: true,
      body: { name: options.name, tags: options.tags, description: options.description ?? "" },
      files: [{ ...options.file, key: "file" }],
      reason: options.reason,
    })) as APISticker;
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
    const sticker = (await container.rest.patch(Routes.guildSticker(this.guildId, stickerId), {
      body,
      reason: options.reason,
    })) as APISticker;
    return this.store(sticker);
  }

  /**
   * Deletes a sticker.
   *
   * @param stickerId The ID of the sticker.
   * @param reason The reason for the audit log.
   */
  public async delete(stickerId: string, reason?: string): Promise<void> {
    await container.rest.delete(Routes.guildSticker(this.guildId, stickerId), { reason });
    await this.cache?.delete(this.resolveKey(stickerId));
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
   */
  public async listCached(): Promise<Sticker[]> {
    const cache = this.cache;
    if (!cache) return [];

    const prefix = `${this.guildId}:`;
    const keys = (await cache.keys()).filter((key) => key.startsWith(prefix));
    const values = await Promise.all(keys.map((key) => cache.get(key)));
    return values
      .filter((value) => value !== undefined)
      .map((value) => this.createStructure(value));
  }

  protected async fetchRaw(stickerId: string) {
    const sticker = (await container.rest.get(
      Routes.guildSticker(this.guildId, stickerId),
    )) as APISticker;
    return { ...sticker, guild_id: this.guildId };
  }

  private async store(sticker: APISticker): Promise<Sticker> {
    const raw = { ...sticker, guild_id: this.guildId };
    await this.cache?.set(this.resolveKey(sticker.id), raw);
    if (sticker.user) await this.client.cache?.users.set(sticker.user.id, sticker.user);
    return this.createStructure(raw);
  }
}
