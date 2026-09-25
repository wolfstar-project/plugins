import { roleKey, type CacheEntityTypes } from "@wolfstar/plugin-cache";
import { Routes, type APIRole } from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import { Role } from "../structures/Role.js";
import { container } from "../util/container.js";
import { CachedManager } from "./CachedManager.js";

/**
 * Manages the {@link Role}s known to the client.
 */
export class RoleManager extends CachedManager<"roles", Role, [guildId: string, roleId: string]> {
  public constructor(client: GatewayClient) {
    super(client, "roles");
  }

  public createStructure(data: CacheEntityTypes["roles"]): Role {
    return new Role(data);
  }

  public resolveKey(guildId: string, roleId: string): string {
    return roleKey(guildId, roleId);
  }

  protected async fetchRaw(guildId: string, roleId: string) {
    const role = (await container.rest.get(Routes.guildRole(guildId, roleId))) as APIRole;
    return { ...role, guild_id: guildId };
  }
}
