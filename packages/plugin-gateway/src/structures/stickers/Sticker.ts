import { cachedGuild } from "../../util/cache.js";
import type { StickerExtension } from "@discordjs/rest";
import { Sticker as BaseSticker } from "@discordjs/structures";
import { StickerFormatType, type APISticker } from "discord-api-types/v10";
import type { GuildStickerEditOptions } from "../../managers/GuildStickerManager.js";
import { cdn } from "../../util/cdn.js";
import type { StickerPack } from "./StickerPack.js";
import type { Guild } from "../guilds/Guild.js";
import { Mixin } from "../Mixin.js";
import {
  initStructure,
  kData,
  kPatch,
  kRelations,
  snowflakeTimestamp,
  StructureMixin,
} from "../Structure.js";
import { User } from "../users/User.js";
import { GatewayError } from "../../errors/GatewayError.js";

/**
 * The relations of a {@link Sticker}, resolved from the cache by the guild's sticker manager.
 */
export interface StickerRelations {
  user?: User;
  guild?: Guild | null;
}

export interface Sticker extends StructureMixin<APISticker, StickerRelations> {}

/**
 * A sticker, a standard one from a sticker pack or a custom one of a guild: `@discordjs/structures`' `Sticker`, with
 * its guild, uploader, and URL, and actions through the client.
 */
export class Sticker extends BaseSticker {
  /**
   * @param data The raw sticker.
   * @param relations The uploader and guild as resolved from the cache, by the guild's sticker manager.
   */
  public constructor(data: APISticker, relations: StickerRelations = {}) {
    super(data);
    initStructure(this, data, relations);
  }

  public [kPatch](data: Readonly<Partial<APISticker>>): this {
    if (data.user) this.dropRelations("user");
    return StructureMixin.prototype[kPatch].call(this, data) as this;
  }

  /**
   * The format of the sticker's image, an alias of `formatType`.
   */
  public get format() {
    return this.formatType;
  }

  /**
   * Whether the sticker can be used, `false` when its guild lost the boosts it needs.
   */
  public override get available(): boolean {
    return this[kData].available ?? true;
  }

  public get guildId(): string | null {
    return this[kData].guild_id ?? null;
  }

  /**
   * The guild, from the cache. `null` outside of guilds, when the guild is not cached, or when the sticker was not built by
   * a manager: use `fetchGuild()` to always get it.
   */
  public get guild(): Guild | null {
    return this.lazyRelation("guild", (client) => cachedGuild(client, this[kData].guild_id));
  }

  /**
   * Fetches the guild, cache first. `null` outside of guilds.
   */
  public async fetchGuild(): Promise<Guild | null> {
    const { guildId } = this;
    return guildId ? this.client.guilds.fetch(guildId) : null;
  }

  /**
   * The ID of the pack of a standard sticker.
   */
  public get packId(): string | null {
    return this[kData].pack_id ?? null;
  }

  /**
   * The position of a standard sticker in its pack.
   */
  public get sortValue(): number | null {
    return this[kData].sort_value ?? null;
  }

  /**
   * The user who uploaded a guild sticker, when the payload includes it (it needs `ManageGuildExpressions`).
   */
  public get user(): User | null {
    const { user } = this[kData];
    return this[kRelations].user ?? (user ? new User(user) : null);
  }

  public override get createdTimestamp(): number {
    return snowflakeTimestamp(this.id);
  }

  public get createdAt() {
    return new Date(this.createdTimestamp);
  }

  /**
   * The URL of the sticker's image: a GIF for GIF stickers, a JSON file for Lottie ones, a PNG otherwise.
   */
  public get url(): string {
    const extension: StickerExtension =
      this.formatType === StickerFormatType.GIF
        ? "gif"
        : this.formatType === StickerFormatType.Lottie
          ? "json"
          : "png";
    return cdn.sticker(this.id, extension);
  }

  /**
   * Fetches the sticker from the API and patches this structure with the result.
   */
  public async fetch(): Promise<this> {
    const sticker = await this.client.fetchSticker(this.id);
    return this[kPatch](sticker.toJSON());
  }

  /**
   * Fetches the pack of a standard sticker, `null` for a guild sticker.
   */
  public async fetchPack(): Promise<StickerPack | null> {
    const { packId } = this;
    if (!packId) return null;
    const packs = await this.client.fetchStickerPacks();
    return packs.find((pack) => pack.id === packId) ?? null;
  }

  /**
   * Fetches the user who uploaded a guild sticker, `null` for a standard one or without `ManageGuildExpressions`.
   */
  public async fetchUser(): Promise<User | null> {
    const { guildId } = this;
    if (!guildId) return null;
    return this.client.guilds.stickers(guildId).fetchUser(this.id);
  }

  /**
   * Edits a guild sticker.
   *
   * @param options The changes to apply.
   */
  public async edit(options: GuildStickerEditOptions): Promise<this> {
    const sticker = await this.client.guilds.stickers(this.requireGuildId()).edit(this.id, options);
    return this[kPatch](sticker.toJSON());
  }

  /**
   * Deletes a guild sticker.
   *
   * @param reason The reason for the audit log.
   */
  public async delete(reason?: string): Promise<this> {
    await this.client.guilds.stickers(this.requireGuildId()).delete(this.id, reason);
    return this;
  }

  /**
   * Whether this sticker has the same data as another one.
   * @param sticker The sticker to compare with.
   */
  public equals(sticker: Sticker): boolean {
    return (
      this.id === sticker.id &&
      this.name === sticker.name &&
      this.description === sticker.description &&
      this.tags === sticker.tags &&
      this.formatType === sticker.formatType &&
      this.available === sticker.available &&
      this.guildId === sticker.guildId
    );
  }

  private requireGuildId(): string {
    const { guildId } = this;
    if (!guildId) throw new GatewayError("NotGuildSticker");
    return guildId;
  }
}

Mixin(Sticker, [StructureMixin]);
