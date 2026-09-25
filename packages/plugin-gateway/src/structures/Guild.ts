import type { CacheEntityTypes } from "@wolfstar/plugin-cache";
import type { ImageURLOptions } from "@discordjs/rest";
import { cdn } from "../util/cdn.js";
import { kData, snowflakeTimestamp, Structure } from "./Structure.js";

/**
 * A Discord guild.
 *
 * @remarks
 * The collections sent in `GUILD_CREATE` (channels, members, roles, ...) are not kept on the guild: they are stored in
 * their own entity caches and exposed by the client's managers.
 */
export class Guild extends Structure<CacheEntityTypes["guilds"]> {
  public get id() {
    return this[kData].id;
  }

  public get name() {
    return this[kData].name;
  }

  public get icon() {
    return this[kData].icon;
  }

  public get ownerId() {
    return this[kData].owner_id;
  }

  public get description() {
    return this[kData].description;
  }

  public get preferredLocale() {
    return this[kData].preferred_locale;
  }

  public get features() {
    return this[kData].features;
  }

  /**
   * The member count, as sent in `GUILD_CREATE` or by the API, or `null` if unknown.
   */
  public get memberCount(): number | null {
    return this[kData].member_count ?? this[kData].approximate_member_count ?? null;
  }

  /**
   * Whether the guild is available, `false` during a Discord outage.
   */
  public get available(): boolean {
    return !this[kData].unavailable;
  }

  public get createdTimestamp() {
    return snowflakeTimestamp(this.id);
  }

  public get createdAt() {
    return new Date(this.createdTimestamp);
  }

  /**
   * Gets the URL of the guild's icon, or `null` if it has none.
   * @param options The image options.
   */
  public iconURL(options?: ImageURLOptions): string | null {
    const { icon } = this[kData];
    return icon ? cdn.icon(this.id, icon, options) : null;
  }

  public toString(): string {
    return this.name;
  }
}
