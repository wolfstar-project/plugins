import type { CacheEntityTypes } from "@wolfstar/plugin-cache";
import { getGatewayClient } from "../util/container.js";
import type { Guild } from "./Guild.js";
import { kData, kRelations, Structure } from "./Structure.js";
import { User } from "./User.js";

/**
 * The raw data of a ban: the banned user, the guild, and the reason when it came from the API.
 */
export type GuildBanData = CacheEntityTypes["bans"] & { reason?: string | null };

/**
 * The relations of a {@link GuildBan}, resolved from the cache by the guild's ban manager.
 */
export interface GuildBanRelations {
  user?: User;
  guild?: Guild | null;
}

/**
 * A ban of a user from a guild.
 */
export class GuildBan extends Structure<GuildBanData> {
  declare public [kRelations]: GuildBanRelations;

  /**
   * @param data The raw ban.
   * @param relations The user and guild as resolved from the cache, by the guild's ban manager.
   */
  public constructor(data: GuildBanData, relations: GuildBanRelations = {}) {
    super(data, relations);
  }

  public get guildId() {
    return this[kData].guild_id;
  }

  public get user(): User {
    return this[kRelations].user ?? new User(this[kData].user);
  }

  /**
   * The reason of the ban. Only bans fetched from the API have it: the gateway does not send it.
   */
  public get reason(): string | null {
    return this[kData].reason ?? null;
  }

  public get guild(): Guild | null {
    return this[kRelations].guild ?? null;
  }

  /**
   * Fetches the ban from the API, which knows its reason.
   */
  public fetch(): Promise<GuildBan> {
    return getGatewayClient().guilds.bans(this.guildId).fetch(this.user.id, { force: true });
  }

  /**
   * Lifts the ban.
   *
   * @param reason The reason for the audit log.
   */
  public async remove(reason?: string): Promise<this> {
    await getGatewayClient().guilds.bans(this.guildId).remove(this.user.id, reason);
    return this;
  }
}
