import type { GatewayClient } from "../GatewayClient.js";
import { ApplicationCommandManager } from "./ApplicationCommandManager.js";

/**
 * Manages the application commands of one guild, like discord.js's `GuildApplicationCommandManager`: an
 * {@link ApplicationCommandManager} bound to the guild, whose `guildId` options are ignored.
 *
 * @remarks
 * Reachable from `guild.commands` and `client.guilds.commands(guildId)`, a new instance on every access.
 */
export class GuildApplicationCommandManager extends ApplicationCommandManager {
  declare public readonly guildId: string;

  /**
   * @param client The client.
   * @param guildId The ID of the guild.
   */
  public constructor(client: GatewayClient, guildId: string) {
    super(client, guildId);
  }
}
