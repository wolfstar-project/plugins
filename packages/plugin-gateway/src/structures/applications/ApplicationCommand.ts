import {
  ApplicationCommandOptionType,
  type APIApplicationCommand,
  type APIApplicationCommandOption,
  type ApplicationCommandType,
  type ApplicationIntegrationType,
  type ChannelType,
  type EntryPointCommandHandlerType,
  type FileUploadType,
  type InteractionContextType,
  type LocalizationMap,
} from "discord-api-types/v10";
import { ApplicationCommandPermissionsManager } from "../../managers/ApplicationCommandPermissionsManager.js";
import type { ApplicationCommandManager } from "../../managers/ApplicationCommandManager.js";
import { compact, firstDefined, type Loose } from "../../util/applicationCommands.js";
import { cachedGuild } from "../../util/cache.js";
import { isDeepEqual } from "../../util/equal.js";
import { PermissionsBitField, type PermissionResolvable } from "../../util/PermissionsBitField.js";
import type { Guild } from "../guilds/Guild.js";
import { kData, kPatch, snowflakeTimestamp, Structure } from "../Structure.js";

/**
 * A choice of an application command option, as the API returns it.
 */
export interface ApplicationCommandOptionChoice {
  name: string;
  /**
   * The name in the locale the command was fetched with.
   */
  nameLocalized?: string | null;
  nameLocalizations?: LocalizationMap | null;
  value: number | string;
}

/**
 * A choice to give an application command option.
 */
export interface ApplicationCommandOptionChoiceData {
  name: string;
  nameLocalizations?: LocalizationMap | null;
  value: number | string;
}

interface ApplicationCommandOptionBase<Choice> {
  type: ApplicationCommandOptionType;
  name: string;
  nameLocalizations?: LocalizationMap | null;
  description: string;
  descriptionLocalizations?: LocalizationMap | null;
  /**
   * Whether the option is required, `false` unless it is given, and not defined for subcommands (groups).
   */
  required?: boolean;
  /**
   * Whether the option is autocompleted, for string, integer, and number options.
   */
  autocomplete?: boolean;
  choices?: Choice[];
  /**
   * The types of channels that can be picked, for channel options.
   */
  channelTypes?: ChannelType[];
  /**
   * The types of files that can be uploaded, for attachment options.
   */
  fileTypes?: FileUploadType[];
  minValue?: number;
  maxValue?: number;
  minLength?: number;
  maxLength?: number;
}

/**
 * An option of an application command or subcommand, as the API returns it with camel-cased keys, like discord.js's
 * `ApplicationCommandOption`.
 */
export interface ApplicationCommandOption extends ApplicationCommandOptionBase<ApplicationCommandOptionChoice> {
  /**
   * The name in the locale the command was fetched with.
   */
  nameLocalized?: string;
  /**
   * The description in the locale the command was fetched with.
   */
  descriptionLocalized?: string;
  options?: ApplicationCommandOption[];
}

/**
 * An option to give an application command or subcommand, like discord.js's `ApplicationCommandOptionData`.
 */
export interface ApplicationCommandOptionData extends ApplicationCommandOptionBase<ApplicationCommandOptionChoiceData> {
  options?: readonly ApplicationCommandOptionResolvable[];
}

/**
 * An option to give an application command: camel-cased data, or the raw API option a builder produces.
 */
export type ApplicationCommandOptionResolvable =
  | APIApplicationCommandOption
  | ApplicationCommandOptionData;

/**
 * The data to create or edit an application command with, like discord.js's `ApplicationCommandData`.
 */
export interface ApplicationCommandData {
  /**
   * The name of the command, in lowercase for chat input commands.
   */
  name: string;
  nameLocalizations?: LocalizationMap | null;
  /**
   * The description of the command, for chat input and primary entry point commands.
   */
  description?: string;
  descriptionLocalizations?: LocalizationMap | null;
  /**
   * Whether the command is age-restricted.
   */
  nsfw?: boolean;
  /**
   * The type of the command.
   *
   * @default ApplicationCommandType.ChatInput
   */
  type?: ApplicationCommandType;
  options?: readonly ApplicationCommandOptionResolvable[];
  /**
   * The permissions a member needs by default to run the command, `null` for everyone.
   */
  defaultMemberPermissions?: PermissionResolvable | null;
  /**
   * The installation contexts where the command is available, for global commands.
   */
  integrationTypes?: ApplicationIntegrationType[];
  /**
   * The interaction contexts where the command can be used, for global commands.
   */
  contexts?: InteractionContextType[];
  /**
   * Whether the app or Discord handles the interaction, for primary entry point commands.
   */
  handler?: EntryPointCommandHandlerType;
}

function isObject(value: unknown): value is Loose {
  return typeof value === "object" && value !== null;
}

function transformChoice(choice: Loose, received: boolean): Loose {
  return compact({
    name: choice.name,
    [received ? "nameLocalized" : "name_localized"]: choice.nameLocalized ?? choice.name_localized,
    [received ? "nameLocalizations" : "name_localizations"]: firstDefined(
      choice.nameLocalizations,
      choice.name_localizations,
    ),
    value: choice.value,
  });
}

function optionEquals(existing: Loose, option: Loose, enforceOptionOrder: boolean): boolean {
  if (
    option.name !== existing.name ||
    option.type !== existing.type ||
    option.description !== existing.description ||
    option.autocomplete !== existing.autocomplete ||
    (option.required ??
      (option.type === ApplicationCommandOptionType.Subcommand ||
      option.type === ApplicationCommandOptionType.SubcommandGroup
        ? undefined
        : false)) !== existing.required ||
    option.choices?.length !== existing.choices?.length ||
    option.options?.length !== existing.options?.length ||
    (option.channelTypes ?? option.channel_types)?.length !== existing.channelTypes?.length ||
    (option.fileTypes ?? option.file_types)?.length !== existing.fileTypes?.length ||
    (option.minValue ?? option.min_value) !== existing.minValue ||
    (option.maxValue ?? option.max_value) !== existing.maxValue ||
    (option.minLength ?? option.min_length) !== existing.minLength ||
    (option.maxLength ?? option.max_length) !== existing.maxLength ||
    !isDeepEqual(
      option.nameLocalizations ?? option.name_localizations ?? {},
      existing.nameLocalizations ?? {},
    ) ||
    !isDeepEqual(
      option.descriptionLocalizations ?? option.description_localizations ?? {},
      existing.descriptionLocalizations ?? {},
    )
  ) {
    return false;
  }

  if (existing.choices) {
    if (enforceOptionOrder) {
      const same = (existing.choices as Loose[]).every((choice, index) => {
        const other = option.choices[index] as Loose | undefined;
        return (
          isObject(other) &&
          choice.name === other.name &&
          choice.value === other.value &&
          isDeepEqual(
            choice.nameLocalizations ?? {},
            other.nameLocalizations ?? other.name_localizations ?? {},
          )
        );
      });
      if (!same) return false;
    } else {
      const newChoices = new Map<unknown, Loose>(
        (option.choices as Loose[]).filter(isObject).map((choice) => [choice.name, choice]),
      );
      for (const choice of existing.choices as Loose[]) {
        const found = newChoices.get(choice.name);
        if (!found || found.value !== choice.value) return false;
      }
    }
  }

  if (existing.channelTypes) {
    const types = (option.channelTypes ?? option.channel_types) as unknown[];
    for (const type of existing.channelTypes) if (!types.includes(type)) return false;
  }

  if (existing.fileTypes) {
    const types = (option.fileTypes ?? option.file_types) as unknown[];
    for (const type of existing.fileTypes) if (!types.includes(type)) return false;
  }

  if (existing.options) {
    return ApplicationCommand.optionsEqual(existing.options, option.options, enforceOptionOrder);
  }

  return true;
}

/**
 * A command of the application, registered globally or in one guild, like discord.js's `ApplicationCommand`.
 *
 * @remarks
 * Application commands are only fetched and edited through the API, never cached: nothing keeps a copy in sync, as
 * Discord sends no event when they change. `edit()` patches this very structure with the API's answer.
 */
export class ApplicationCommand extends Structure<APIApplicationCommand> {
  // The options are transformed once per payload, so that they stay the same objects between reads.
  #options: { source: unknown; value: ApplicationCommandOption[] | null } | null = null;

  #permissions: ApplicationCommandPermissionsManager | null = null;

  public get id(): string {
    return this[kData].id;
  }

  /**
   * The ID of the application owning the command.
   */
  public get applicationId(): string {
    return this[kData].application_id;
  }

  /**
   * The ID of the guild the command is registered in, `null` for a global command.
   */
  public get guildId(): string | null {
    return this[kData].guild_id ?? null;
  }

  /**
   * The guild the command is registered in, from the cache. `null` for a global command, or when the guild is not
   * cached: use {@link ApplicationCommand.fetchGuild} to always get it.
   */
  public get guild(): Guild | null {
    return this.lazyRelation("guild", (client) => cachedGuild(client, this.guildId));
  }

  /**
   * Fetches the guild the command is registered in, cache first.
   *
   * @returns The guild, `null` for a global command.
   */
  public async fetchGuild(): Promise<Guild | null> {
    const { guildId } = this;
    return guildId ? this.client.guilds.fetch(guildId) : null;
  }

  /**
   * The manager of this command's permissions: on its guild, or on any guild when the command is global.
   */
  public get permissions(): ApplicationCommandPermissionsManager {
    return (this.#permissions ??= new ApplicationCommandPermissionsManager(this.client, {
      guildId: this.guildId,
      commandId: this.id,
    }));
  }

  /**
   * The manager this command belongs to: the one of its guild, else the application's.
   */
  public get manager(): ApplicationCommandManager {
    const { guildId } = this;
    return guildId ? this.client.guilds.commands(guildId) : this.client.application.commands;
  }

  public get type(): ApplicationCommandType {
    return this[kData].type;
  }

  public get name(): string {
    return this[kData].name;
  }

  public get nameLocalizations(): LocalizationMap | null {
    return this[kData].name_localizations ?? null;
  }

  /**
   * The name in the locale the command was fetched with, `null` if it was not fetched with one.
   */
  public get nameLocalized(): string | null {
    return this[kData].name_localized ?? null;
  }

  public get description(): string {
    return this[kData].description;
  }

  public get descriptionLocalizations(): LocalizationMap | null {
    return this[kData].description_localizations ?? null;
  }

  /**
   * The description in the locale the command was fetched with, `null` if it was not fetched with one.
   */
  public get descriptionLocalized(): string | null {
    return this[kData].description_localized ?? null;
  }

  /**
   * Whether the command is age-restricted.
   */
  public get nsfw(): boolean {
    return this[kData].nsfw ?? false;
  }

  /**
   * The options of the command, `null` if it has none.
   */
  public get options(): ApplicationCommandOption[] | null {
    const source = this[kData].options;
    let cached = this.#options;
    if (cached?.source !== source || cached === null) {
      cached = {
        source,
        value: source
          ? source.map((option) => ApplicationCommand.transformOption(option, true))
          : null,
      };
      this.#options = cached;
    }

    return cached.value;
  }

  /**
   * The permissions a member needs by default to run the command, `null` for everyone.
   */
  public get defaultMemberPermissions(): Readonly<PermissionsBitField> | null {
    const permissions = this[kData].default_member_permissions;
    return permissions ? new PermissionsBitField(BigInt(permissions)).freeze() : null;
  }

  /**
   * The installation contexts where the command is available, only for global commands.
   */
  public get integrationTypes(): ApplicationIntegrationType[] | null {
    return this[kData].integration_types ?? null;
  }

  /**
   * The interaction contexts where the command can be used, only for global commands.
   */
  public get contexts(): InteractionContextType[] | null {
    return this[kData].contexts ?? null;
  }

  /**
   * Whether the app or Discord handles the interaction, only for primary entry point commands.
   */
  public get handler(): EntryPointCommandHandlerType | null {
    return this[kData].handler ?? null;
  }

  /**
   * The autoincrementing version of the command, updated on substantial changes.
   */
  public get version(): string {
    return this[kData].version;
  }

  public get createdTimestamp(): number {
    return snowflakeTimestamp(this.id);
  }

  public get createdAt(): Date {
    return new Date(this.createdTimestamp);
  }

  /**
   * Edits the command, and patches this structure with the result.
   *
   * @param data The fields to edit.
   * @returns This command.
   */
  public async edit(data: Partial<ApplicationCommandData>): Promise<this> {
    const edited = await this.manager.edit(this, data);
    // The API leaves out what a command no longer has, which a patch would otherwise keep.
    return this[kPatch]({
      name_localizations: undefined,
      name_localized: undefined,
      description_localizations: undefined,
      description_localized: undefined,
      options: undefined,
      integration_types: undefined,
      contexts: undefined,
      handler: undefined,
      ...edited.toJSON(),
    });
  }

  /**
   * Edits the name of the command.
   *
   * @param name The new name.
   */
  public setName(name: string): Promise<this> {
    return this.edit({ name });
  }

  /**
   * Edits the localized names of the command.
   *
   * @param nameLocalizations The new localized names, `null` removes them.
   */
  public setNameLocalizations(nameLocalizations: LocalizationMap | null): Promise<this> {
    return this.edit({ nameLocalizations });
  }

  /**
   * Edits the description of the command.
   *
   * @param description The new description.
   */
  public setDescription(description: string): Promise<this> {
    return this.edit({ description });
  }

  /**
   * Edits the localized descriptions of the command.
   *
   * @param descriptionLocalizations The new localized descriptions, `null` removes them.
   */
  public setDescriptionLocalizations(
    descriptionLocalizations: LocalizationMap | null,
  ): Promise<this> {
    return this.edit({ descriptionLocalizations });
  }

  /**
   * Edits the permissions a member needs by default to run the command.
   *
   * @param defaultMemberPermissions The new permissions, `null` for everyone.
   */
  public setDefaultMemberPermissions(
    defaultMemberPermissions: PermissionResolvable | null,
  ): Promise<this> {
    return this.edit({ defaultMemberPermissions });
  }

  /**
   * Edits the options of the command.
   *
   * @param options The new options.
   */
  public setOptions(options: readonly ApplicationCommandOptionResolvable[]): Promise<this> {
    return this.edit({ options });
  }

  /**
   * Deletes the command.
   *
   * @returns This command.
   */
  public async delete(): Promise<this> {
    await this.manager.delete(this);
    return this;
  }

  /**
   * Whether this command equals another one, like discord.js's `ApplicationCommand#equals`. It compares every field
   * the other command has, so for most uses comparing IDs is faster and enough. `false` for anything that is not a
   * command, data, or raw command.
   *
   * @param command The command, its data, or its raw form, to compare with.
   * @param enforceOptionOrder Whether options and choices must come in the same order. Discord may not keep the
   * order they were sent in.
   */
  public equals(command: unknown, enforceOptionOrder = false): boolean {
    if (!isObject(command)) return false;
    if (command.id && this.id !== command.id) return false;

    let defaultMemberPermissions: bigint | null = null;
    try {
      if ("default_member_permissions" in command) {
        defaultMemberPermissions = command.default_member_permissions
          ? BigInt(command.default_member_permissions)
          : null;
      }

      if ("defaultMemberPermissions" in command) {
        defaultMemberPermissions =
          command.defaultMemberPermissions === null ||
          command.defaultMemberPermissions === undefined
            ? null
            : PermissionsBitField.resolve(command.defaultMemberPermissions);
      }
    } catch {
      return false;
    }

    if (
      command.name !== this.name ||
      ("description" in command && command.description !== this.description) ||
      ("version" in command && command.version !== this.version) ||
      (command.type && command.type !== this.type) ||
      ("nsfw" in command && command.nsfw !== this.nsfw) ||
      command.options?.length !== this.options?.length ||
      defaultMemberPermissions !== (this.defaultMemberPermissions?.bitField ?? null) ||
      !isDeepEqual(
        command.nameLocalizations ?? command.name_localizations ?? {},
        this.nameLocalizations ?? {},
      ) ||
      !isDeepEqual(
        command.descriptionLocalizations ?? command.description_localizations ?? {},
        this.descriptionLocalizations ?? {},
      ) ||
      !isDeepEqual(
        command.integrationTypes ?? command.integration_types ?? [],
        this.integrationTypes ?? [],
      ) ||
      !isDeepEqual(command.contexts ?? [], this.contexts ?? []) ||
      ("handler" in command && command.handler !== this.handler)
    ) {
      return false;
    }

    // Both lengths are equal by now, so one of them being defined is enough.
    if (command.options) {
      return ApplicationCommand.optionsEqual(this.options!, command.options, enforceOptionOrder);
    }

    return true;
  }

  /**
   * Recursively checks that the options of an application command equal the given ones, like discord.js's
   * `ApplicationCommand.optionsEqual`. For most uses, {@link ApplicationCommand.equals} is better. `false` for
   * anything that is not a list of options.
   *
   * @param existing The options of the existing command, {@link ApplicationCommand.options}.
   * @param options The options to compare with: camel-cased data or raw options.
   * @param enforceOptionOrder Whether options and choices must come in the same order.
   */
  public static optionsEqual(
    existing: readonly ApplicationCommandOption[],
    options: readonly ApplicationCommandOptionResolvable[],
    enforceOptionOrder = false,
  ): boolean {
    if (!Array.isArray(existing) || !Array.isArray(options)) return false;
    if (existing.length !== options.length) return false;
    if (!existing.every(isObject) || !options.every(isObject)) return false;

    if (enforceOptionOrder) {
      return existing.every((option, index) =>
        optionEquals(option, options[index] as Loose, enforceOptionOrder),
      );
    }

    const newOptions = new Map<unknown, Loose>(
      options.map((option) => [(option as Loose).name, option as Loose]),
    );
    for (const option of existing) {
      const found = newOptions.get(option.name);
      if (!found || !optionEquals(option, found, false)) return false;
    }

    return true;
  }

  /**
   * Transforms an option into the camel-cased form {@link ApplicationCommand.options} has, or into the API's, like
   * discord.js's `ApplicationCommand.transformOption`.
   *
   * @param option The option, camel-cased or raw.
   * @param received Whether to build the camel-cased form of an option received from Discord, rather than the raw one
   * to send.
   */
  public static transformOption(
    option: ApplicationCommandOption | ApplicationCommandOptionResolvable,
    received: true,
  ): ApplicationCommandOption;
  public static transformOption(
    option: ApplicationCommandOption | ApplicationCommandOptionResolvable,
    received?: false,
  ): APIApplicationCommandOption;
  public static transformOption(
    option: ApplicationCommandOption | ApplicationCommandOptionResolvable,
    received = false,
  ): APIApplicationCommandOption | ApplicationCommandOption {
    const data = option as Loose;
    const key = (camel: string, snake: string) => (received ? camel : snake);
    return compact({
      type: data.type,
      name: data.name,
      [key("nameLocalizations", "name_localizations")]: firstDefined(
        data.nameLocalizations,
        data.name_localizations,
      ),
      [key("nameLocalized", "name_localized")]: data.nameLocalized ?? data.name_localized,
      description: data.description,
      [key("descriptionLocalizations", "description_localizations")]: firstDefined(
        data.descriptionLocalizations,
        data.description_localizations,
      ),
      [key("descriptionLocalized", "description_localized")]:
        data.descriptionLocalized ?? data.description_localized,
      required:
        data.required ??
        (data.type === ApplicationCommandOptionType.Subcommand ||
        data.type === ApplicationCommandOptionType.SubcommandGroup
          ? undefined
          : false),
      autocomplete: data.autocomplete,
      choices: data.choices?.map((choice: Loose) => transformChoice(choice, received)),
      options: data.options?.map((nested: Loose) =>
        ApplicationCommand.transformOption(nested as never, received as never),
      ),
      [key("channelTypes", "channel_types")]: data.channelTypes ?? data.channel_types,
      [key("fileTypes", "file_types")]: data.fileTypes ?? data.file_types,
      [key("minValue", "min_value")]: data.minValue ?? data.min_value,
      [key("maxValue", "max_value")]: data.maxValue ?? data.max_value,
      [key("minLength", "min_length")]: data.minLength ?? data.min_length,
      [key("maxLength", "max_length")]: data.maxLength ?? data.max_length,
    }) as APIApplicationCommandOption | ApplicationCommandOption;
  }
}
