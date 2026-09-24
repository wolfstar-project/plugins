import type { CacheEntityTypes } from "@wolfstar/plugin-cache";
import { Routes, type APIUser } from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import { User } from "../structures/User.js";
import { container } from "../util/container.js";
import { CachedManager } from "./CachedManager.js";

/**
 * Manages the {@link User}s known to the client.
 */
export class UserManager extends CachedManager<"users", User, [userId: string]> {
  public constructor(client: GatewayClient) {
    super(client, "users");
  }

  public createStructure(data: CacheEntityTypes["users"]): User {
    return new User(data);
  }

  public resolveKey(userId: string): string {
    return userId;
  }

  protected async fetchRaw(userId: string) {
    return (await container.rest.get(Routes.user(userId))) as APIUser;
  }
}
