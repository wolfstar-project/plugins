import {
  Routes,
  type APIGuild,
  type APITemplate,
  type RESTPatchAPIGuildTemplateJSONBody,
  type RESTPostAPIGuildTemplatesJSONBody,
  type RESTPostAPITemplateCreateGuildJSONBody,
} from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import type { Guild } from "../structures/guilds/Guild.js";
import { GuildTemplate } from "../structures/guilds/GuildTemplate.js";
import {
  resolveGuildTemplateCode,
  resolveImageOption,
  type ImageResolvable,
} from "../util/DataResolver.js";

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
   * The icon: a data URI, or anything `resolveImage` reads.
   */
  icon?: ImageResolvable;
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
    return this.build(await this.client.api.guilds.getTemplate(resolveGuildTemplateCode(code)));
  }

  /**
   * Fetches the templates of a guild.
   *
   * @param guildId The ID of the guild.
   */
  public async list(guildId: string): Promise<GuildTemplate[]> {
    const templates = await this.client.api.guilds.getTemplates(guildId);
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
    const template = await this.client.api.guilds.createTemplate(guildId, body);
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
    const template = await this.client.api.guilds.editTemplate(guildId, code, body);
    return this.build(template);
  }

  /**
   * Syncs a template with the current state of its guild.
   *
   * @param guildId The ID of the template's guild.
   * @param code The code of the template.
   */
  public async sync(guildId: string, code: string): Promise<GuildTemplate> {
    const template = await this.client.api.guilds.syncTemplate(guildId, code);
    return this.build(template);
  }

  /**
   * Deletes a template.
   *
   * @param guildId The ID of the template's guild.
   * @param code The code of the template.
   */
  public async delete(guildId: string, code: string): Promise<void> {
    await this.client.api.guilds.deleteTemplate(guildId, code);
  }

  /**
   * Creates a guild from a template, which Discord only allows to bots in fewer than 10 guilds.
   *
   * @param code The code of the template.
   * @param options The name and icon of the guild.
   */
  public async createGuild(code: string, options: GuildTemplateCreateGuildOptions): Promise<Guild> {
    const body: RESTPostAPITemplateCreateGuildJSONBody = {
      name: options.name,
      icon: (await resolveImageOption(options.icon)) ?? undefined,
    };
    const guild = (await this.client.api.rest.post(Routes.template(code), {
      body,
    })) as APIGuild;
    return this.client.guilds._add(guild);
  }

  private async build(template: APITemplate): Promise<GuildTemplate> {
    const creator = await this.client.users._add(template.creator);
    const guild = (await this.client.guilds.get(template.source_guild_id)) ?? null;
    return new GuildTemplate(template, { guild, creator });
  }
}
