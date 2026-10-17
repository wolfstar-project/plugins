import { Collection } from "@discordjs/collection";
import { makeURLSearchParams } from "@discordjs/rest";
import {
  Routes,
  type APIApplicationCommand,
  type Locale,
  type RESTPatchAPIApplicationCommandJSONBody,
  type RESTPostAPIApplicationCommandsJSONBody,
} from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import { GatewayTypeError } from "../errors/GatewayError.js";
import { ApplicationCommand } from "../structures/applications/ApplicationCommand.js";
import { bindClient } from "../structures/Structure.js";
import type { ApplicationCommandDataResolvable, ApplicationCommandResolvable } from "../types.js";
import { PermissionsBitField } from "../util/PermissionsBitField.js";
import { ApplicationCommandPermissionsManager } from "./ApplicationCommandPermissionsManager.js";
import { BaseManager } from "./BaseManager.js";

/**
 * The options to fetch application commands with.
 */
export interface FetchApplicationCommandOptions {
  /**
   * The ID of the command to fetch. Every command is fetched when omitted.
   */
  id?: string;
  /**
   * The ID of the guild to fetch commands of, global commands when omitted. Ignored by the manager of a guild.
   */
  guildId?: string;
  /**
   * The locale to localize the names and descriptions of every command for, sent as `X-Discord-Locale`. Not used
   * when fetching one command.
   */
  locale?: Locale | `${Locale}`;
  /**
   * Whether to include the full localization dictionaries, instead of the localized name and description.
   */
  withLocalizations?: boolean;
}

// The loose view of the data the transformation reads: camel-cased data, a raw command, or a structure.
type Loose = Record<string, any>;

// `null` is a value here, it removes localizations: unlike `??`, only `undefined` falls back to the raw key.
function firstDefined<Value>(
  camel: Value | undefined,
  snake: Value | undefined,
): Value | undefined {
  return camel === undefined ? snake : camel;
}

function compact<Value extends Loose>(value: Value): Value {
  for (const key of Object.keys(value)) if (value[key] === undefined) delete value[key];
  return value;
}

/**
 * Manages the application commands of the application, global or of a guild, through the API.
 *
 * @remarks
 * Commands are never cached: Discord sends no event when they change, so a copy could not be kept in sync. Every
 * method calls the API, and returns new {@link ApplicationCommand} structures.
 *
 * `@wolfstar/http-framework` registers the commands of its pieces on its own, with the same bulk overwrite
 * {@link ApplicationCommandManager.set} sends. Calling `set()` replaces whatever the framework registered, and
 * nothing here runs by itself: use it to manage commands the framework does not, or instead of it.
 */
export class ApplicationCommandManager extends BaseManager {
  /**
   * The ID of the guild this manager acts on, `null` for global commands (and for the guilds of its methods' `guildId`
   * option).
   */
  public readonly guildId: string | null;

  /**
   * The manager of the permissions of any command, in any guild (the one of this manager's guild).
   */
  public readonly permissions: ApplicationCommandPermissionsManager;

  /**
   * @param client The client.
   * @param guildId The ID of the guild to bind the manager to, see `client.guilds.commands(guildId)` and
   * `guild.commands`. Global when omitted.
   */
  public constructor(client: GatewayClient, guildId: string | null = null) {
    super(client);
    this.guildId = guildId;
    this.permissions = new ApplicationCommandPermissionsManager(client, { guildId });
  }

  /**
   * The path of the commands, or of one command.
   *
   * @param options The ID of the command, and the ID of the guild (ignored by the manager of a guild).
   */
  public commandPath({ id, guildId }: { id?: string; guildId?: string } = {}): `/${string}` {
    const applicationId = this.client.application.id;
    const guild = this.guildId ?? guildId;
    if (guild) {
      return id
        ? Routes.applicationGuildCommand(applicationId, guild, id)
        : Routes.applicationGuildCommands(applicationId, guild);
    }

    return id
      ? Routes.applicationCommand(applicationId, id)
      : Routes.applicationCommands(applicationId);
  }

  /**
   * Resolves a command, or its ID, to its ID.
   *
   * @param command The command, a raw one, or its ID.
   * @returns The ID, `null` if the value holds none.
   */
  public resolveId(command: ApplicationCommandResolvable): string | null {
    if (typeof command === "string") return command;
    const id = (command as { id?: unknown } | null)?.id;
    return typeof id === "string" ? id : null;
  }

  /**
   * Fetches one command, from the API.
   *
   * @param id The ID of the command, or the options with it.
   */
  public fetch(
    id: string | (FetchApplicationCommandOptions & { id: string }),
  ): Promise<ApplicationCommand>;
  /**
   * Fetches every command, from the API.
   *
   * @param options The guild (ignored by the manager of a guild), the locale to localize for, and whether to include
   * the localizations.
   */
  public fetch(
    options?: FetchApplicationCommandOptions & { id?: undefined },
  ): Promise<Collection<string, ApplicationCommand>>;
  public async fetch(
    options?: string | FetchApplicationCommandOptions,
  ): Promise<ApplicationCommand | Collection<string, ApplicationCommand>> {
    if (typeof options === "string") return this.#fetchOne(options);
    if (options?.id) return this.#fetchOne(options.id, options.guildId);
    return this.#fetchMany(options);
  }

  async #fetchOne(id: string, guildId?: string): Promise<ApplicationCommand> {
    const applicationId = this.client.application.id;
    const guild = this.guildId ?? guildId;
    const data = guild
      ? await this.client.api.applicationCommands.getGuildCommand(applicationId, guild, id)
      : await this.client.api.applicationCommands.getGlobalCommand(applicationId, id);
    return this.#build(data as APIApplicationCommand, guild);
  }

  async #fetchMany({
    guildId,
    locale,
    withLocalizations,
  }: FetchApplicationCommandOptions = {}): Promise<Collection<string, ApplicationCommand>> {
    const applicationId = this.client.application.id;
    const guild = this.guildId ?? guildId;
    let commands: APIApplicationCommand[];
    if (locale) {
      // The API of `@discordjs/core` takes no headers.
      commands = (await this.client.rest.get(this.commandPath({ guildId }), {
        headers: { "X-Discord-Locale": locale },
        query: makeURLSearchParams({ with_localizations: withLocalizations }),
      })) as APIApplicationCommand[];
    } else {
      const query = { with_localizations: withLocalizations };
      commands = (await (guild
        ? this.client.api.applicationCommands.getGuildCommands(applicationId, guild, query)
        : this.client.api.applicationCommands.getGlobalCommands(
            applicationId,
            query,
          ))) as APIApplicationCommand[];
    }

    return this.#collect(commands, guild);
  }

  /**
   * Creates an application command.
   *
   * @param command The command: camel-cased data, a raw command, or a builder.
   * @param guildId The ID of the guild to create it in, global when omitted. Ignored by the manager of a guild.
   */
  public async create(
    command: ApplicationCommandDataResolvable,
    guildId?: string,
  ): Promise<ApplicationCommand> {
    const applicationId = this.client.application.id;
    const guild = this.guildId ?? guildId;
    const body = ApplicationCommandManager.transformCommand(command);
    const data = guild
      ? await this.client.api.applicationCommands.createGuildCommand(
          applicationId,
          guild,
          body as never,
        )
      : await this.client.api.applicationCommands.createGlobalCommand(applicationId, body);
    return this.#build(data as APIApplicationCommand, guild);
  }

  /**
   * Replaces every command of the application, or of a guild, with the given ones: the bulk overwrite.
   *
   * @remarks
   * It deletes the commands that are not among the given ones, including the ones `@wolfstar/http-framework`
   * registered for its pieces. Use it to manage the commands yourself, not alongside the framework.
   *
   * @param commands The commands: camel-cased data, raw commands, or builders.
   * @param guildId The ID of the guild to set them in, global when omitted. Ignored by the manager of a guild.
   * @returns The commands as stored, by ID.
   */
  public async set(
    commands: readonly ApplicationCommandDataResolvable[],
    guildId?: string,
  ): Promise<Collection<string, ApplicationCommand>> {
    const applicationId = this.client.application.id;
    const guild = this.guildId ?? guildId;
    const body = commands.map((command) => ApplicationCommandManager.transformCommand(command));
    const data = guild
      ? await this.client.api.applicationCommands.bulkOverwriteGuildCommands(
          applicationId,
          guild,
          body as never,
        )
      : await this.client.api.applicationCommands.bulkOverwriteGlobalCommands(applicationId, body);
    return this.#collect(data as APIApplicationCommand[], guild);
  }

  /**
   * Edits an application command.
   *
   * @param command The command, or its ID.
   * @param data The fields to edit.
   * @param guildId The ID of the guild it is registered in, global when omitted. Ignored by the manager of a guild.
   * @throws {GatewayTypeError} `InvalidType` when `command` holds no ID.
   */
  public async edit(
    command: ApplicationCommandResolvable,
    data: Partial<ApplicationCommandDataResolvable>,
    guildId?: string,
  ): Promise<ApplicationCommand> {
    const id = this.resolveId(command);
    if (!id) throw new GatewayTypeError("InvalidType", "command", "ApplicationCommandResolvable");

    const applicationId = this.client.application.id;
    const guild = this.guildId ?? guildId ?? (command as { guildId?: string | null }).guildId;
    const body = ApplicationCommandManager.transformCommand(
      data as ApplicationCommandDataResolvable,
    ) as RESTPatchAPIApplicationCommandJSONBody;
    const patched = guild
      ? await this.client.api.applicationCommands.editGuildCommand(
          applicationId,
          guild,
          id,
          body as never,
        )
      : await this.client.api.applicationCommands.editGlobalCommand(applicationId, id, body);
    return this.#build(patched as APIApplicationCommand, guild);
  }

  /**
   * Deletes an application command.
   *
   * @param command The command, or its ID.
   * @param guildId The ID of the guild it is registered in, global when omitted. Ignored by the manager of a guild.
   * @throws {GatewayTypeError} `InvalidType` when `command` holds no ID.
   */
  public async delete(command: ApplicationCommandResolvable, guildId?: string): Promise<void> {
    const id = this.resolveId(command);
    if (!id) throw new GatewayTypeError("InvalidType", "command", "ApplicationCommandResolvable");

    const applicationId = this.client.application.id;
    const guild = this.guildId ?? guildId ?? (command as { guildId?: string | null }).guildId;
    await (guild
      ? this.client.api.applicationCommands.deleteGuildCommand(applicationId, guild, id)
      : this.client.api.applicationCommands.deleteGlobalCommand(applicationId, id));
  }

  /**
   * Transforms command data into the payload to send to the API, like discord.js's
   * `ApplicationCommandManager.transformCommand`.
   *
   * @param command The command: camel-cased data, a raw command, or a builder (anything with a `toJSON()`).
   */
  public static transformCommand(
    command: ApplicationCommandDataResolvable,
  ): RESTPostAPIApplicationCommandsJSONBody {
    const data = command as Loose;
    if (typeof data.toJSON === "function") {
      return data.toJSON() as RESTPostAPIApplicationCommandsJSONBody;
    }

    // `undefined` leaves the permissions as they are, `null` removes them.
    let defaultMemberPermissions: string | null | undefined;
    if ("default_member_permissions" in data) {
      defaultMemberPermissions = data.default_member_permissions
        ? BigInt(data.default_member_permissions).toString()
        : data.default_member_permissions;
    }

    if ("defaultMemberPermissions" in data) {
      defaultMemberPermissions =
        data.defaultMemberPermissions === null || data.defaultMemberPermissions === undefined
          ? data.defaultMemberPermissions
          : PermissionsBitField.resolve(data.defaultMemberPermissions).toString();
    }

    return compact({
      name: data.name,
      name_localizations: firstDefined(data.nameLocalizations, data.name_localizations),
      description: data.description,
      nsfw: data.nsfw,
      description_localizations: firstDefined(
        data.descriptionLocalizations,
        data.description_localizations,
      ),
      type: data.type,
      options: data.options?.map((option: Loose) =>
        ApplicationCommand.transformOption(option as never),
      ),
      default_member_permissions: defaultMemberPermissions,
      integration_types: data.integrationTypes ?? data.integration_types,
      contexts: data.contexts,
      handler: data.handler,
    }) as RESTPostAPIApplicationCommandsJSONBody;
  }

  // Builds a command, in the guild it was fetched from when the API does not say.
  #build(data: APIApplicationCommand, guildId: string | null | undefined): ApplicationCommand {
    return bindClient(
      new ApplicationCommand(guildId && !data.guild_id ? { ...data, guild_id: guildId } : data),
      this.client,
    );
  }

  #collect(
    commands: readonly APIApplicationCommand[],
    guildId: string | null | undefined,
  ): Collection<string, ApplicationCommand> {
    const collection = new Collection<string, ApplicationCommand>();
    for (const data of commands) collection.set(data.id, this.#build(data, guildId));
    return collection;
  }
}
