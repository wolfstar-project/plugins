import { RouteBases, type APITemplate } from "discord-api-types/v10";
import type {
  GuildTemplateCreateGuildOptions,
  GuildTemplateEditOptions,
} from "../managers/GuildTemplateManager.js";
import { getGatewayClient } from "../util/container.js";
import type { Guild } from "./Guild.js";
import { kData, kPatch, kRelations, Structure } from "./Structure.js";
import { User } from "./User.js";

/**
 * The relations of a {@link GuildTemplate}: its source guild, when cached.
 */
export interface GuildTemplateRelations {
  guild?: Guild | null;
}

/**
 * A guild template: a snapshot of a guild's channels, roles, and settings, to create guilds from.
 */
export class GuildTemplate extends Structure<APITemplate> {
  declare public [kRelations]: GuildTemplateRelations;

  /**
   * @param data The raw template.
   * @param relations The source guild, as resolved from the cache.
   */
  public constructor(data: APITemplate, relations: GuildTemplateRelations = {}) {
    super(data, relations);
  }

  public get code() {
    return this[kData].code;
  }

  public get name() {
    return this[kData].name;
  }

  public get description() {
    return this[kData].description;
  }

  public get usageCount() {
    return this[kData].usage_count;
  }

  public get creatorId() {
    return this[kData].creator_id;
  }

  public get creator(): User {
    return new User(this[kData].creator);
  }

  public get createdTimestamp() {
    return Date.parse(this[kData].created_at);
  }

  public get createdAt() {
    return new Date(this.createdTimestamp);
  }

  /**
   * When the template was last synced with its guild.
   */
  public get updatedTimestamp() {
    return Date.parse(this[kData].updated_at);
  }

  public get updatedAt() {
    return new Date(this.updatedTimestamp);
  }

  /**
   * The ID of the guild the template was made from.
   */
  public get guildId() {
    return this[kData].source_guild_id;
  }

  /**
   * The snapshot of the guild the template creates.
   */
  public get serializedGuild() {
    return this[kData].serialized_source_guild;
  }

  /**
   * Whether the guild changed since the template was last synced.
   */
  public get unSynced(): boolean | null {
    return this[kData].is_dirty;
  }

  public get guild(): Guild | null {
    return this[kRelations].guild ?? null;
  }

  /**
   * The URL to create a guild from the template in the Discord app.
   */
  public get url(): string {
    return `${RouteBases.template}/${this.code}`;
  }

  /**
   * Creates a guild from the template, which Discord only allows to bots in fewer than 10 guilds.
   *
   * @param options The name and icon of the guild.
   */
  public createGuild(options: GuildTemplateCreateGuildOptions): Promise<Guild> {
    return getGatewayClient().templates.createGuild(this.code, options);
  }

  /**
   * Edits the template.
   *
   * @param options The name and description.
   */
  public async edit(options: GuildTemplateEditOptions): Promise<this> {
    const template = await getGatewayClient().templates.edit(this.guildId, this.code, options);
    return this[kPatch](template.toJSON());
  }

  /**
   * Syncs the template with the current state of its guild.
   */
  public async sync(): Promise<this> {
    const template = await getGatewayClient().templates.sync(this.guildId, this.code);
    return this[kPatch](template.toJSON());
  }

  public async delete(): Promise<this> {
    await getGatewayClient().templates.delete(this.guildId, this.code);
    return this;
  }

  public toString(): string {
    return this.code;
  }
}
