import { memberKey, type CacheEntityTypes } from "@wolfstar/plugin-cache";
import { Routes, type APIGuildMember } from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import { GuildMember } from "../structures/GuildMember.js";
import { container } from "../util/container.js";
import { CachedManager } from "./CachedManager.js";

/**
 * Manages the {@link GuildMember}s known to the client.
 */
export class GuildMemberManager extends CachedManager<
  "members",
  GuildMember,
  [guildId: string, userId: string]
> {
  public constructor(client: GatewayClient) {
    super(client, "members");
  }

  public createStructure(data: CacheEntityTypes["members"]): GuildMember {
    return new GuildMember(data);
  }

  public resolveKey(guildId: string, userId: string): string {
    return memberKey(guildId, userId);
  }

  protected async fetchRaw(guildId: string, userId: string) {
    const member = (await container.rest.get(
      Routes.guildMember(guildId, userId),
    )) as APIGuildMember;
    return { ...member, guild_id: guildId };
  }
}
