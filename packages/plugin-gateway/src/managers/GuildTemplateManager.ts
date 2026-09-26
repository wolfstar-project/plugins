import {
  Routes,
  type APIGuild,
  type APITemplate,
  type RESTPatchAPIGuildTemplateJSONBody,
  type RESTPostAPIGuildTemplatesJSONBody,
  type RESTPostAPITemplateCreateGuildJSONBody,
} from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import type { Guild } from "../structures/Guild.js";
import { GuildTemplate } from "../structures/GuildTemplate.js";
import { container } from "../util/container.js";

/**
 * The options to create a template with.
 */
export interface GuildTemplateCreateOptions {
  name: string;
  description?: string | null;
}

/**
 * The options to edit a template with.
 */
export interface GuildTemplateEditOptions {
  name?: string;
  description?: string | null;
}

/**
 * The options to create a guild from a template with.
 */
export interface GuildTemplateCreateGuildOptions {
  name: string;
  /**
   * The icon, as a data URI.
   */
  icon?: string;
}

/**
 * Manages guild templates. Discord does not send them over the gateway, so they are never cached.
 */
export class GuildTemplateManager {
  public readonly client: GatewayClient;

  public constructor(client: GatewayClient) {
    this.client = client;
  }

  /**
   * Fetches a template by its code.
   *
   * @param code The code of the template, or its URL.
   */
  public async fetch(code: string): Promise<GuildTemplate> {
    // Accept `https://discord.new/code` as well as the bare code.
    const resolved = code.split("/").pop()!;
    return this.build((await container.rest.get(Routes.template(resolved))) as APITemplate);
  }

  /**
   * Fetches the templates of a guild.
   *
   * @param guildId The ID of the guild.
   */
  public async list(guildId: string): Promise<GuildTemplate[]> {
    const templates = (await container.rest.get(Routes.guildTemplates(guildId))) as APITemplate[];
    return Promise.all(templates.map((template) => this.build(template)));
  }

  /**
   * Creates a template of a guild.
   *
   * @param guildId The ID of the guild.
   * @param options The name and description of the template.
   */
  public async create(
    guildId: string,
    options: GuildTemplateCreateOptions,
  ): Promise<GuildTemplate> {
    const body: RESTPostAPIGuildTemplatesJSONBody = {
      name: options.name,
      description: options.description,
    };
    const template = (await container.rest.post(Routes.guildTemplates(guildId), {
      body,
    })) as APITemplate;
    return this.build(template);
  }

  /**
   * Edits a template.
   *
   * @param guildId The ID of the template's guild.
   * @param code The code of the template.
   * @param options The name and description.
   */
  public async edit(
    guildId: string,
    code: string,
    options: GuildTemplateEditOptions,
  ): Promise<GuildTemplate> {
    const body: RESTPatchAPIGuildTemplateJSONBody = {
      name: options.name,
      description: options.description,
    };
    const template = (await container.rest.patch(Routes.guildTemplate(guildId, code), {
      body,
    })) as APITemplate;
    return this.build(template);
  }

  /**
   * Syncs a template with the current state of its guild.
   *
   * @param guildId The ID of the template's guild.
   * @param code The code of the template.
   */
  public async sync(guildId: string, code: string): Promise<GuildTemplate> {
    const template = (await container.rest.put(Routes.guildTemplate(guildId, code))) as APITemplate;
    return this.build(template);
  }

  /**
   * Deletes a template.
   *
   * @param guildId The ID of the template's guild.
   * @param code The code of the template.
   */
  public async delete(guildId: string, code: string): Promise<void> {
    await container.rest.delete(Routes.guildTemplate(guildId, code));
  }

  /**
   * Creates a guild from a template, which Discord only allows to bots in fewer than 10 guilds.
   *
   * @param code The code of the template.
   * @param options The name and icon of the guild.
   */
  public async createGuild(code: string, options: GuildTemplateCreateGuildOptions): Promise<Guild> {
    const body: RESTPostAPITemplateCreateGuildJSONBody = { name: options.name, icon: options.icon };
    const guild = (await container.rest.post(Routes.template(code), { body })) as APIGuild;
    return this.client.guilds._add(guild);
  }

  private async build(template: APITemplate): Promise<GuildTemplate> {
    await this.client.users._add(template.creator);
    const guild = (await this.client.guilds.get(template.source_guild_id)) ?? null;
    return new GuildTemplate(template, { guild });
  }
}
