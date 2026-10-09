import type {
  APIApplication,
  APIApplicationRoleConnectionMetadata,
  ApplicationIntegrationType,
  ApplicationRoleConnectionMetadataType,
  ApplicationWebhookEventStatus,
  ApplicationWebhookEventType,
  LocalizationMap,
  OAuth2Scopes,
  RESTPatchCurrentApplicationJSONBody,
} from "discord-api-types/v10";
import { resolveImageOption, type ImageResolvable } from "../../util/DataResolver.js";
import { cachedGuild } from "../../util/cache.js";
import { ApplicationFlagsBitField, type ApplicationFlagsResolvable } from "../../util/flags.js";
import { PermissionsBitField, type PermissionResolvable } from "../../util/PermissionsBitField.js";
import type { Guild } from "../guilds/Guild.js";
import { bindClient, kClient, kData, kPatch } from "../Structure.js";
import { User } from "../users/User.js";
import { Application } from "./Application.js";
import { Team } from "./Team.js";

/**
 * The install parameters of an application: the scopes and permissions it asks for when it is added.
 */
export interface ApplicationInstallParams {
  scopes: OAuth2Scopes[];
  permissions: Readonly<PermissionsBitField>;
}

/**
 * The install parameters of an application for each integration type (guild or user install).
 */
export type ApplicationIntegrationTypesConfig = {
  [Type in ApplicationIntegrationType]?: { oauth2InstallParams: ApplicationInstallParams | null };
};

/**
 * The install parameters to set, with permissions in any form a `PermissionsBitField` resolves.
 */
export interface ApplicationInstallParamsOptions {
  scopes: OAuth2Scopes[];
  permissions: PermissionResolvable;
}

/**
 * The options to edit the application with.
 *
 * @remarks
 * Omitted fields are left unchanged. Images are data URIs (`data:image/png;base64,...`) or anything `resolveImage`
 * reads (contents, a path, a URL, a stream, a blob), `null` removes them.
 */
export interface ClientApplicationEditOptions {
  customInstallURL?: string;
  description?: string;
  eventWebhooksURL?: string | null;
  eventWebhooksStatus?: ApplicationWebhookEventStatus;
  eventWebhooksTypes?: ApplicationWebhookEventType[];
  flags?: ApplicationFlagsResolvable;
  icon?: ImageResolvable | null;
  coverImage?: ImageResolvable | null;
  interactionsEndpointURL?: string | null;
  roleConnectionsVerificationURL?: string | null;
  tags?: string[];
  installParams?: ApplicationInstallParamsOptions;
  integrationTypesConfig?: {
    [Type in ApplicationIntegrationType]?: {
      oauth2InstallParams?: ApplicationInstallParamsOptions;
    };
  };
}

/**
 * A role connection metadata record of an application, with camelCased fields like discord.js.
 */
export interface ApplicationRoleConnectionMetadata {
  name: string;
  nameLocalizations?: LocalizationMap;
  description: string;
  descriptionLocalizations?: LocalizationMap;
  key: string;
  type: ApplicationRoleConnectionMetadataType;
}

function toRoleConnectionMetadata(
  record: APIApplicationRoleConnectionMetadata,
): ApplicationRoleConnectionMetadata {
  return {
    name: record.name,
    nameLocalizations: record.name_localizations,
    description: record.description,
    descriptionLocalizations: record.description_localizations,
    key: record.key,
    type: record.type,
  };
}

function fromInstallParams(
  params: NonNullable<APIApplication["install_params"]>,
): ApplicationInstallParams {
  return {
    scopes: params.scopes,
    permissions: new PermissionsBitField(BigInt(params.permissions)).freeze(),
  };
}

function toInstallParams(
  params: ApplicationInstallParamsOptions,
): NonNullable<APIApplication["install_params"]> {
  return {
    scopes: params.scopes,
    permissions: PermissionsBitField.resolve(params.permissions).toString(),
  };
}

/**
 * The application of the bot, the entry point for everything owned by the application rather than by a guild, like
 * discord.js's `ClientApplication`.
 *
 * @remarks
 * Unlike discord.js, `client.application` exists from the construction of the client, with only its ID known until
 * `READY` patches in the flags, and {@link ClientApplication.fetch} the rest: check {@link ClientApplication.partial}
 * before relying on the other fields.
 */
export class ClientApplication extends Application {
  // The owner is built once per payload, so that it stays the same object between reads.
  #owner: { team: unknown; user: unknown; value: Team | User | null } | null = null;

  /**
   * Whether only the ID and flags of the application are known: it has neither been fetched nor edited yet.
   */
  public get partial(): boolean {
    return this[kData].name === undefined;
  }

  /**
   * The flags of the application.
   */
  public get flags(): Readonly<ApplicationFlagsBitField> {
    return new ApplicationFlagsBitField(this[kData].flags ?? 0).freeze();
  }

  /**
   * The tags describing the application, at most five.
   */
  public get tags(): string[] {
    return [...(this[kData].tags ?? [])] as string[];
  }

  /**
   * The scopes and permissions the application asks for when it is added to a guild, or `null` if it sets none.
   */
  public get installParams(): ApplicationInstallParams | null {
    const params = this[kData].install_params;
    return params ? fromInstallParams(params) : null;
  }

  /**
   * The install parameters of the application for each integration type, or `null` if it sets none.
   */
  public get integrationTypesConfig(): ApplicationIntegrationTypesConfig | null {
    const config = this[kData].integration_types_config;
    if (!config) return null;

    const result: ApplicationIntegrationTypesConfig = {};
    for (const [type, value] of Object.entries(config)) {
      const params = value.oauth2_install_params;
      result[Number(type) as ApplicationIntegrationType] = {
        oauth2InstallParams: params ? fromInstallParams(params) : null,
      };
    }
    return result;
  }

  /**
   * The URL the application is installed through, instead of Discord's own install link.
   */
  public get customInstallURL(): string | null {
    return this[kData].custom_install_url ?? null;
  }

  /**
   * The team owning the application, else the user who does, `null` while it is not known.
   */
  public get owner(): Team | User | null {
    const { team, owner } = this[kData];
    if (!this.#owner || this.#owner.team !== team || this.#owner.user !== owner) {
      let value: Team | User | null = null;
      if (team) {
        value = new Team(team);
      } else if (owner) {
        value = new User(owner);
      }
      // Bound to this client, so that the team's members and their users are as well.
      const client = this[kClient];
      if (value && client) bindClient(value, client);
      this.#owner = { team, user: owner, value };
    }
    return this.#owner.value;
  }

  /**
   * Whether anyone can add the bot to a guild, or `null` if it is not known.
   */
  public get botPublic(): boolean | null {
    return this[kData].bot_public ?? null;
  }

  /**
   * Whether the bot only joins guilds after the full OAuth2 code grant flow, or `null` if it is not known.
   */
  public get botRequireCodeGrant(): boolean | null {
    return this[kData].bot_require_code_grant ?? null;
  }

  /**
   * The ID of the guild linked to the application, or `null` if there is none.
   */
  public get guildId(): string | null {
    return this[kData].guild_id ?? null;
  }

  /**
   * The guild linked to the application, from the cache.
   */
  public get guild(): Guild | null {
    return this.lazyRelation("guild", (client) => cachedGuild(client, this.guildId));
  }

  /**
   * The approximate number of guilds the bot is in, or `null` if it is not known.
   */
  public get approximateGuildCount(): number | null {
    return this[kData].approximate_guild_count ?? null;
  }

  /**
   * The approximate number of users who installed the application, or `null` if it is not known.
   */
  public get approximateUserInstallCount(): number | null {
    return this[kData].approximate_user_install_count ?? null;
  }

  /**
   * The URL interactions are sent to, or `null` if there is none.
   */
  public get interactionsEndpointURL(): string | null {
    return this[kData].interactions_endpoint_url ?? null;
  }

  /**
   * The URL of the role connections verification, or `null` if there is none.
   */
  public get roleConnectionsVerificationURL(): string | null {
    return this[kData].role_connections_verification_url ?? null;
  }

  /**
   * The URL event webhooks are sent to, or `null` if there is none.
   */
  public get eventWebhooksURL(): string | null {
    return this[kData].event_webhooks_url ?? null;
  }

  /**
   * Whether event webhooks are enabled, or `null` if it is not known.
   */
  public get eventWebhooksStatus(): ApplicationWebhookEventStatus | null {
    return this[kData].event_webhooks_status ?? null;
  }

  /**
   * The event types sent to {@link ClientApplication.eventWebhooksURL}, or `null` if it is not known.
   */
  public get eventWebhooksTypes(): ApplicationWebhookEventType[] | null {
    const types = this[kData].event_webhooks_types;
    return types ? [...types] : null;
  }

  /**
   * Fetches the application from the API, and patches this structure with it.
   *
   * @returns This application.
   */
  public async fetch(): Promise<this> {
    const data = await this.client.api.applications.getCurrent();
    return this[kPatch](data);
  }

  /**
   * Edits the application, and patches this structure with the result.
   *
   * @param options The fields to edit.
   * @returns This application.
   */
  public async edit(options: ClientApplicationEditOptions): Promise<this> {
    const body: RESTPatchCurrentApplicationJSONBody = {
      custom_install_url: options.customInstallURL,
      description: options.description,
      event_webhooks_url: options.eventWebhooksURL,
      event_webhooks_status: options.eventWebhooksStatus,
      event_webhooks_types: options.eventWebhooksTypes,
      flags:
        options.flags === undefined
          ? undefined
          : Number(ApplicationFlagsBitField.resolve(options.flags)),
      icon: await resolveImageOption(options.icon),
      cover_image: await resolveImageOption(options.coverImage),
      interactions_endpoint_url: options.interactionsEndpointURL,
      role_connections_verification_url: options.roleConnectionsVerificationURL,
      tags: options.tags as RESTPatchCurrentApplicationJSONBody["tags"],
      install_params: options.installParams && toInstallParams(options.installParams),
      integration_types_config:
        options.integrationTypesConfig &&
        Object.fromEntries(
          Object.entries(options.integrationTypesConfig).map(([type, config]) => [
            type,
            {
              oauth2_install_params:
                config.oauth2InstallParams && toInstallParams(config.oauth2InstallParams),
            },
          ]),
        ),
    };
    for (const key of Object.keys(body) as (keyof typeof body)[]) {
      if (body[key] === undefined) delete body[key];
    }
    const data = await this.client.api.applications.editCurrent(body);
    return this[kPatch](data);
  }

  /**
   * Fetches the role connection metadata records of the application.
   */
  public async fetchRoleConnectionMetadataRecords(): Promise<ApplicationRoleConnectionMetadata[]> {
    const records = await this.client.api.roleConnections.getMetadataRecords(this.id);
    return records.map(toRoleConnectionMetadata);
  }

  /**
   * Replaces the role connection metadata records of the application.
   *
   * @param records The records to set, up to five. Records left out are removed.
   * @returns The records as stored.
   */
  public async editRoleConnectionMetadataRecords(
    records: readonly ApplicationRoleConnectionMetadata[],
  ): Promise<ApplicationRoleConnectionMetadata[]> {
    const updated = await this.client.api.roleConnections.updateMetadataRecords(
      this.id,
      records.map((record) => ({
        key: record.key,
        name: record.name,
        name_localizations: record.nameLocalizations,
        description: record.description,
        description_localizations: record.descriptionLocalizations,
        type: record.type,
      })),
    );
    return updated.map(toRoleConnectionMetadata);
  }
}
