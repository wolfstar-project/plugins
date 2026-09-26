import type { BaseImageURLOptions, ImageURLOptions } from "@discordjs/rest";
import type { APIGuildPreview } from "discord-api-types/v10";
import { cdn } from "../util/cdn.js";
import { GuildEmoji } from "./GuildEmoji.js";
import { Sticker } from "./Sticker.js";
import { kData, snowflakeTimestamp, Structure } from "./Structure.js";

/**
 * The public preview of a guild, available for discoverable guilds and the ones the bot is in.
 */
export class GuildPreview extends Structure<APIGuildPreview> {
  public get id() {
    return this[kData].id;
  }

  public get name() {
    return this[kData].name;
  }

  public get icon() {
    return this[kData].icon;
  }

  public get splash() {
    return this[kData].splash;
  }

  public get discoverySplash() {
    return this[kData].discovery_splash;
  }

  public get description() {
    return this[kData].description;
  }

  public get features() {
    return this[kData].features;
  }

  public get approximateMemberCount() {
    return this[kData].approximate_member_count;
  }

  public get approximatePresenceCount() {
    return this[kData].approximate_presence_count;
  }

  public get emojis(): GuildEmoji[] {
    return this[kData].emojis.map((emoji) => new GuildEmoji({ ...emoji, guild_id: this.id }));
  }

  public get stickers(): Sticker[] {
    return this[kData].stickers.map((sticker) => new Sticker(sticker));
  }

  public get createdTimestamp() {
    return snowflakeTimestamp(this.id);
  }

  public get createdAt() {
    return new Date(this.createdTimestamp);
  }

  public iconURL(options?: ImageURLOptions): string | null {
    const { icon } = this;
    return icon ? cdn.icon(this.id, icon, options) : null;
  }

  public splashURL(options?: BaseImageURLOptions): string | null {
    const { splash } = this;
    return splash ? cdn.splash(this.id, splash, options) : null;
  }

  public discoverySplashURL(options?: BaseImageURLOptions): string | null {
    const { discoverySplash } = this;
    return discoverySplash ? cdn.discoverySplash(this.id, discoverySplash, options) : null;
  }

  public toString(): string {
    return this.name;
  }
}
