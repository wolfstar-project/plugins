import type { CacheEntityTypes } from "@wolfstar/plugin-cache";
import { Routes, type APIGuild } from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import { Guild } from "../structures/Guild.js";
import { container } from "../util/container.js";
import { CachedManager } from "./CachedManager.js";

/**
 * Manages the {@link Guild}s known to the client.
 */
export class GuildManager extends CachedManager<"guilds", Guild, [guildId: string]> {
  public constructor(client: GatewayClient) {
    super(client, "guilds");
  }

  public createStructure(data: CacheEntityTypes["guilds"]): Guild {
    return new Guild(data);
  }

  public resolveKey(guildId: string): string {
    return guildId;
  }

  protected async fetchRaw(guildId: string) {
    const query = new URLSearchParams({ with_counts: "true" });
    return (await container.rest.get(Routes.guild(guildId), { query })) as APIGuild;
  }
}
