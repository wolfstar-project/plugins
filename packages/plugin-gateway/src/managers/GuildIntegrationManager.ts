import { integrationKey, type CacheEntityTypes } from "@wolfstar/plugin-cache";
import { Routes, type APIGuildIntegration } from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import { Integration } from "../structures/Integration.js";
import { container } from "../util/container.js";
import { CachedManager, type AddOptions } from "./CachedManager.js";

/**
 * Manages the integrations of one guild.
 *
 * @remarks
 * Discord has no route to fetch a single integration: `fetch` lists them all, and rejects when the ID is not among
 * them.
 */
export class GuildIntegrationManager extends CachedManager<
  "integrations",
  Integration,
  [integrationId: string]
> {
  public readonly guildId: string;

  public constructor(client: GatewayClient, guildId: string) {
    super(client, "integrations");
    this.guildId = guildId;
  }

  public createStructure(data: CacheEntityTypes["integrations"]): Integration {
    return new Integration(data);
  }

  public keyOf(data: CacheEntityTypes["integrations"]): string {
    return this.resolveKey(data.id);
  }

  public resolveKey(integrationId: string): string {
    return integrationKey(this.guildId, integrationId);
  }

  /**
   * Adds an integration to the cache, and its user to `client.users`.
   *
   * @internal
   */
  public override async _add(
    data: CacheEntityTypes["integrations"],
    cache = true,
    options?: AddOptions,
  ): Promise<Integration> {
    if (data.user) await this.client.users._add(data.user, cache);
    return super._add(data, cache, options);
  }

  public override async hydrate(data: CacheEntityTypes["integrations"]): Promise<Integration> {
    const [user, guild] = await Promise.all([
      data.user ? this.client.users.resolveData(data.user) : null,
      this.cachedGuild(data.guild_id),
    ]);
    return new Integration(data, { user, guild });
  }

  /**
   * Fetches every integration of the guild, and caches them.
   */
  public async fetchAll(): Promise<Integration[]> {
    const integrations = await this.list();
    return Promise.all(integrations.map((integration) => this._add(integration)));
  }

  /**
   * Removes an integration from the guild, kicking its bot if it has one, and drops it from the cache.
   *
   * @param integrationId The ID of the integration.
   * @param reason The reason for the audit log.
   */
  public async delete(integrationId: string, reason?: string): Promise<void> {
    await container.rest.delete(Routes.guildIntegration(this.guildId, integrationId), { reason });
    await this.cache?.delete(this.resolveKey(integrationId));
  }

  protected async fetchRaw(integrationId: string) {
    const integration = (await this.list()).find(({ id }) => id === integrationId);
    if (!integration) {
      throw new RangeError(`The guild ${this.guildId} has no integration ${integrationId}`);
    }

    return integration;
  }

  private async list(): Promise<CacheEntityTypes["integrations"][]> {
    const integrations = (await container.rest.get(
      Routes.guildIntegrations(this.guildId),
    )) as APIGuildIntegration[];
    return integrations.map((integration) => ({ ...integration, guild_id: this.guildId }));
  }
}
