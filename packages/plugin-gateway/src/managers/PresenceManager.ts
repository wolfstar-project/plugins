import { presenceKey, type CacheEntityTypes } from "@wolfstar/plugin-cache";
import type { GatewayClient } from "../GatewayClient.js";
import { Presence } from "../structures/Presence.js";
import { CachedManager } from "./CachedManager.js";

/**
 * Manages the presences of guild members.
 *
 * @remarks
 * Presences only come from the gateway, with the `GuildPresences` intent: there is no API to fetch them, so `fetch`
 * rejects on a cache miss. Use `get`, which resolves to `undefined` instead.
 */
export class PresenceManager extends CachedManager<
  "presences",
  Presence,
  [guildId: string, userId: string]
> {
  public constructor(client: GatewayClient) {
    super(client, "presences");
  }

  public createStructure(data: CacheEntityTypes["presences"]): Presence {
    return new Presence(data);
  }

  public keyOf(data: CacheEntityTypes["presences"]): string {
    return this.resolveKey(data.guild_id, data.user.id);
  }

  public resolveKey(guildId: string, userId: string): string {
    return presenceKey(guildId, userId);
  }

  public override async hydrate(data: CacheEntityTypes["presences"]): Promise<Presence> {
    const [user, member, guild] = await Promise.all([
      this.client.users.get(data.user.id),
      this.client.members.get(data.guild_id, data.user.id),
      this.cachedGuild(data.guild_id),
    ]);
    return new Presence(data, { user: user ?? null, member: member ?? null, guild });
  }

  /**
   * Lists the cached presences of a guild.
   *
   * @param guildId The ID of the guild.
   */
  public async listCached(guildId: string): Promise<Presence[]> {
    const prefix = `${guildId}:`;
    const entries = (await this.cache?.entries()) ?? [];
    return Promise.all(
      entries.filter(([key]) => key.startsWith(prefix)).map(([, raw]) => this.hydrate(raw)),
    );
  }

  protected fetchRaw(guildId: string, userId: string): Promise<CacheEntityTypes["presences"]> {
    return Promise.reject(
      new Error(
        `Presences cannot be fetched from the API (user ${userId} of guild ${guildId} is not cached)`,
      ),
    );
  }
}
