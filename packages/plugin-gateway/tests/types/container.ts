// Type-level test, checked by the root `typecheck` script through `tsconfig.consumption.json`: pieces must reach the
// `GatewayClient` through `container.gatewayClient` without any cast, while `container.client` keeps the framework's
// `Client` type, so plain clients are not affected.
import type { WebSocketManager } from "@discordjs/ws";
import { Command, container, Listener, type Client } from "@wolfstar/http-framework";
import type { GatewayClient, GuildManager } from "../../src/index.js";

export const gatewayClient: GatewayClient = container.gatewayClient;
export const client: Client = container.client;
export const gateway: WebSocketManager = container.gatewayClient.gateway;

export class GuildManagerListener extends Listener {
  public run(): GuildManager {
    return this.container.gatewayClient.guilds;
  }
}

// The README's example.
export class GuildNameCommand extends Command {
  public override async chatInputRun(interaction: Command.ChatInputInteraction) {
    const guild = await this.container.gatewayClient.guilds.fetch(interaction.guildId!);
    return interaction.reply({ content: guild.name });
  }
}

// @ts-expect-error `container.client` stays typed as the base `Client`, which has no managers.
export const guilds = container.client.guilds;
