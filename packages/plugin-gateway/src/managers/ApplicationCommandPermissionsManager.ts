import { Collection } from "@discordjs/collection";
import { applicationCommandPermissionsKey, type CacheEntityTypes } from "@wolfstar/plugin-cache";
import {
  ApplicationCommandPermissionType,
  RESTJSONErrorCodes,
  Routes,
  type APIApplicationCommandPermission,
  type APIGuildApplicationCommandPermissions,
  type Snowflake,
} from "discord-api-types/v10";
import { GatewayError, GatewayTypeError } from "../errors/GatewayError.js";
import type {
  ApplicationCommandPermissionIdResolvable,
  ApplicationCommandResolvable,
  GuildChannelResolvable,
  GuildResolvable,
  RoleResolvable,
  UserResolvable,
} from "../types.js";
import type { GatewayClient } from "../GatewayClient.js";
import { BaseManager } from "./BaseManager.js";

/**
 * A permission of an application command: whether a role, user, or channel may use it.
 */
export type ApplicationCommandPermissions = APIApplicationCommandPermission;

/**
 * The ID standing for the `@everyone` role in the permissions of a command: the ID of the guild.
 */
export type RolePermissionConstant = Snowflake;

/**
 * The ID standing for every channel in the permissions of a command: the ID of the guild minus one.
 */
export type ChannelPermissionConstant = Snowflake;

/**
 * Where an {@link ApplicationCommandPermissionsManager} acts: a guild and a command it is bound to, none of them for
 * the manager of the application, whose options then have to carry them.
 */
export interface ApplicationCommandPermissionsScope {
  guildId?: string | null;
  commandId?: string | null;
}

/**
 * The options every method of the permissions manager takes to say where to act.
 */
export interface BaseApplicationCommandPermissionsOptions {
  /**
   * The guild to modify or check permissions in. Ignored by a manager bound to a guild.
   */
  guild?: GuildResolvable;
  /**
   * The command to modify or check permissions of. Ignored by a manager bound to a command.
   */
  command?: ApplicationCommandResolvable;
}

/**
 * The options to fetch permissions with.
 */
export interface FetchApplicationCommandPermissionsOptions extends BaseApplicationCommandPermissionsOptions {
  /**
   * Whether to skip the cache and always ask the API, for the permissions of one command.
   *
   * @default false
   */
  force?: boolean;
}

/**
 * The options to set or add permissions with.
 *
 * @remarks
 * Omitting `command` edits the permissions of the guild, as a whole, when the manager is not bound to a command: they
 * apply to the commands without permissions of their own.
 */
export interface ApplicationCommandPermissionsEditOptions extends BaseApplicationCommandPermissionsOptions {
  /**
   * The permissions to set, or to add to the existing ones.
   */
  permissions: ApplicationCommandPermissions[];
  /**
   * The OAuth2 bearer token of a user able to manage the guild, with the `applications.commands.permissions.update`
   * scope: Discord refuses the bot's own token here.
   */
  token: string;
}

/**
 * The options to remove permissions with. At least one of `users`, `roles`, and `channels` is required.
 */
export interface RemoveApplicationCommandPermissionsOptions extends BaseApplicationCommandPermissionsOptions {
  /**
   * The OAuth2 bearer token of a user able to manage the guild, with the `applications.commands.permissions.update`
   * scope.
   */
  token: string;
  users?: readonly UserResolvable[];
  /**
   * The roles to remove: roles, or IDs, or the ID of the guild for `@everyone`.
   */
  roles?: readonly (RolePermissionConstant | RoleResolvable)[];
  /**
   * The channels to remove: channels, or IDs, or the ID of the guild minus one for every channel.
   */
  channels?: readonly (ChannelPermissionConstant | GuildChannelResolvable)[];
}

/**
 * The options to check for a permission with.
 */
export interface HasApplicationCommandPermissionsOptions extends BaseApplicationCommandPermissionsOptions {
  /**
   * The user, role, channel, or constant to look for.
   */
  permissionId: ApplicationCommandPermissionIdResolvable;
  /**
   * Only look for a permission of this type, which tells apart a channel from the `@everyone` role when their IDs
   * are equal.
   */
  permissionType?: ApplicationCommandPermissionType;
}

function isUnknownPermissions(error: unknown): boolean {
  return (
    (error as { code?: unknown } | null)?.code ===
    RESTJSONErrorCodes.UnknownApplicationCommandPermissions
  );
}

// Roles and channels are identified by their ID alone: unlike discord.js, nothing is resolved through a guild.
function idOf(value: unknown): string | null {
  if (typeof value === "string") return value;
  const id = (value as { id?: unknown } | null)?.id;
  return typeof id === "string" ? id : null;
}

function guildIdOf(guild: GuildResolvable | undefined): string | null {
  if (guild === undefined || guild === null) return null;
  if (typeof guild === "string") return guild;
  const { guildId } = guild as { guildId?: unknown };
  return typeof guildId === "string" ? guildId : idOf(guild);
}

/**
 * Manages the permissions of application commands, like discord.js's `ApplicationCommandPermissionsManager`.
 *
 * @remarks
 * Reachable from `client.application.commands.permissions` (any guild and command), `guild.commands.permissions` (one
 * guild) and `command.permissions` (one command): the scope it is bound to decides which of the options' `guild` and
 * `command` are needed, and are ignored.
 *
 * Reads use the bot's authorization, and the `applicationCommandPermissions` cache (kept up to date by
 * `APPLICATION_COMMAND_PERMISSIONS_UPDATE`) when the client has one. Writes (`set`, `add`, `remove`) cannot use it:
 * Discord only accepts an OAuth2 bearer token of a user there, passed as the `token` option. Obtaining one is up to
 * the caller, there is no OAuth2 flow here.
 */
export class ApplicationCommandPermissionsManager extends BaseManager {
  /**
   * The ID of the guild this manager acts on, `null` for any.
   */
  public readonly guildId: string | null;

  /**
   * The ID of the command this manager acts on, `null` for any.
   */
  public readonly commandId: string | null;

  public constructor(client: GatewayClient, scope: ApplicationCommandPermissionsScope = {}) {
    super(client);
    this.guildId = scope.guildId ?? null;
    this.commandId = scope.commandId ?? null;
  }

  /**
   * The path of the permissions of a guild's commands, or of one command.
   *
   * @param guildId The ID of the guild.
   * @param commandId The ID of the command.
   */
  public permissionsPath(guildId: string, commandId?: string): string {
    const applicationId = this.client.application.id;
    return commandId
      ? Routes.applicationCommandPermissions(applicationId, guildId, commandId)
      : Routes.guildApplicationCommandsPermissions(applicationId, guildId);
  }

  /**
   * Fetches the permissions of one command, or of every command of a guild. The ID of the application as the command
   * stands for the permissions of the guild as a whole.
   *
   * @remarks
   * The permissions of one command come from the cache when it has them, unless `force` is set. The API's answer is
   * written to the cache.
   *
   * @param options The guild and command, as far as this manager is not bound to them.
   * @returns The permissions of the command, or of each command of the guild, by command ID.
   * @throws {GatewayError} `GlobalCommandPermissions` when no guild is known.
   */
  public fetch(
    options: FetchApplicationCommandPermissionsOptions & { command: ApplicationCommandResolvable },
  ): Promise<ApplicationCommandPermissions[]>;
  public fetch(
    options?: FetchApplicationCommandPermissionsOptions,
  ): Promise<ApplicationCommandPermissions[] | Collection<string, ApplicationCommandPermissions[]>>;
  public async fetch({
    guild,
    command,
    force = false,
  }: FetchApplicationCommandPermissionsOptions = {}): Promise<
    ApplicationCommandPermissions[] | Collection<string, ApplicationCommandPermissions[]>
  > {
    const { guildId, commandId } = this.#validate(guild, command);
    const applicationId = this.client.application.id;
    if (commandId) {
      if (!force) {
        const cached = await this.#cached(guildId, commandId);
        if (cached) return cached.permissions;
      }

      const data = await this.client.api.applicationCommands.getGuildCommandPermissions(
        applicationId,
        guildId,
        commandId,
      );
      await this.#remember(data);
      return data.permissions;
    }

    const all = await this.client.api.applicationCommands.getGuildCommandsPermissions(
      applicationId,
      guildId,
    );
    await Promise.all(all.map((data) => this.#remember(data)));
    return new Collection(
      all.map((data): [string, ApplicationCommandPermissions[]] => [data.id, data.permissions]),
    );
  }

  /**
   * Sets the permissions of the guild, or of a command, replacing the existing ones.
   *
   * @param options The permissions, the bearer token, and the guild and command as far as this manager is not bound to
   * them.
   * @returns The permissions as stored.
   * @throws {GatewayError} `ApplicationCommandPermissionsTokenMissing` without a token, and `GlobalCommandPermissions`
   * when no guild is known.
   */
  public async set(
    options: ApplicationCommandPermissionsEditOptions,
  ): Promise<ApplicationCommandPermissions[]> {
    const { guild, command, permissions, token } = options;
    if (!token) throw new GatewayError("ApplicationCommandPermissionsTokenMissing");

    const { guildId, commandId } = this.#validate(guild, command, true);
    if (!Array.isArray(permissions)) {
      throw new GatewayTypeError(
        "InvalidType",
        "permissions",
        "Array of ApplicationCommandPermissions",
        true,
      );
    }

    const data = await this.client.api.applicationCommands.editGuildCommandPermissions(
      token,
      this.client.application.id,
      guildId,
      commandId,
      { permissions },
    );
    await this.#remember(data);
    return data.permissions;
  }

  /**
   * Adds permissions to the existing ones of the guild or a command. A permission for an ID that has one already
   * replaces it.
   *
   * @param options The permissions to add, the bearer token, and the guild and command as far as this manager is not
   * bound to them.
   * @returns The permissions as stored.
   * @throws {GatewayError} `ApplicationCommandPermissionsTokenMissing` without a token, and `GlobalCommandPermissions`
   * when no guild is known.
   */
  public async add(
    options: ApplicationCommandPermissionsEditOptions,
  ): Promise<ApplicationCommandPermissions[]> {
    const { guild, command, permissions, token } = options;
    if (!token) throw new GatewayError("ApplicationCommandPermissionsTokenMissing");

    const { guildId, commandId } = this.#validate(guild, command, true);
    if (!Array.isArray(permissions)) {
      throw new GatewayTypeError(
        "InvalidType",
        "permissions",
        "Array of ApplicationCommandPermissions",
        true,
      );
    }

    const existing = await this.#existing(guildId, commandId, true);
    const merged = [...permissions];
    for (const permission of existing) {
      if (!merged.some((other) => other.id === permission.id)) merged.push(permission);
    }

    return this.set({ guild: guildId, command: commandId, permissions: merged, token });
  }

  /**
   * Removes users, roles, and channels from the permissions of the guild or a command.
   *
   * @param options Who to remove, the bearer token, and the guild and command as far as this manager is not bound to
   * them.
   * @returns The permissions as stored.
   * @throws {GatewayError} `ApplicationCommandPermissionsTokenMissing` without a token, and `GlobalCommandPermissions`
   * when no guild is known.
   */
  public async remove(
    options: RemoveApplicationCommandPermissionsOptions,
  ): Promise<ApplicationCommandPermissions[]> {
    const { guild, command, users, roles, channels, token } = options;
    if (!token) throw new GatewayError("ApplicationCommandPermissionsTokenMissing");

    const { guildId, commandId } = this.#validate(guild, command, true);
    if (!users && !roles && !channels) {
      throw new GatewayTypeError(
        "InvalidType",
        "users OR roles OR channels",
        "Array or Resolvable",
        true,
      );
    }

    const userIds = this.#ids(users, "users", (user) => this.client.users.resolveId(user));
    const roleIds = this.#ids(roles, "roles", idOf);
    const channelIds = this.#ids(channels, "channels", idOf);

    const existing = await this.#existing(guildId, commandId, true);
    const permissions = existing.filter((permission) => {
      switch (permission.type) {
        case ApplicationCommandPermissionType.Role:
          return !roleIds.includes(permission.id);
        case ApplicationCommandPermissionType.User:
          return !userIds.includes(permission.id);
        case ApplicationCommandPermissionType.Channel:
          return !channelIds.includes(permission.id);
        default:
          return true;
      }
    });

    return this.set({ guild: guildId, command: commandId, permissions, token });
  }

  /**
   * Checks whether a command has a permission for a user, role, channel, or constant.
   *
   * @remarks
   * It reads the permissions like {@link ApplicationCommandPermissionsManager.fetch} does, from the cache when it has
   * them. Pass `force: true` to {@link ApplicationCommandPermissionsManager.fetch} first for fresher ones.
   *
   * @param options The ID to look for, and the guild and command as far as this manager is not bound to them.
   * @throws {GatewayError} `GlobalCommandPermissions` when no guild is known.
   */
  public async has(options: HasApplicationCommandPermissionsOptions): Promise<boolean> {
    const { guild, command, permissionId, permissionType } = options;
    const { guildId, commandId } = this.#validate(guild, command);
    if (!commandId) {
      throw new GatewayTypeError("InvalidType", "command", "ApplicationCommandResolvable");
    }

    // A user, a role, and a channel all resolve to their ID.
    const resolved =
      typeof permissionId === "string"
        ? permissionId
        : this.client.users.resolveId(permissionId as UserResolvable);
    if (!resolved) {
      throw new GatewayTypeError(
        "InvalidType",
        "permissionId",
        "UserResolvable, RoleResolvable, ChannelResolvable, or Permission Constant",
      );
    }

    const existing = await this.#existing(guildId, commandId);
    // The type is checked when given, for the one case where a channel has the ID of the @everyone role.
    return existing.some(
      (permission) =>
        permission.id === resolved && (permissionType ?? permission.type) === permission.type,
    );
  }

  // The permissions of a command, none when it has none of its own.
  async #existing(
    guildId: string,
    commandId: string,
    force = false,
  ): Promise<ApplicationCommandPermissions[]> {
    try {
      return await this.fetch({ guild: guildId, command: commandId, force });
    } catch (error) {
      if (isUnknownPermissions(error)) return [];
      throw error;
    }
  }

  #ids<Value>(
    values: readonly Value[] | undefined,
    name: string,
    resolve: (value: Value) => string | null,
  ): string[] {
    if (values === undefined) return [];
    if (!Array.isArray(values)) throw new GatewayTypeError("InvalidType", name, "Array", true);
    return values.map((value) => {
      const id = resolve(value);
      if (!id) throw new GatewayTypeError("InvalidElement", "Array", name, value);
      return id;
    });
  }

  // The guild and command to act on. With `defaultCommand`, the application's own ID stands for no command: the
  // permissions of the guild as a whole.
  #validate(
    guild: GuildResolvable | undefined,
    command: ApplicationCommandResolvable | undefined,
    defaultCommand: true,
  ): { guildId: string; commandId: string };
  #validate(
    guild: GuildResolvable | undefined,
    command: ApplicationCommandResolvable | undefined,
  ): { guildId: string; commandId: string | null };
  #validate(
    guild: GuildResolvable | undefined,
    command: ApplicationCommandResolvable | undefined,
    defaultCommand = false,
  ): { guildId: string; commandId: string | null } {
    const guildId = this.guildId ?? guildIdOf(guild);
    if (!guildId) throw new GatewayError("GlobalCommandPermissions");

    let commandId = this.commandId;
    if (command && !commandId) {
      commandId = idOf(command);
      if (!commandId) {
        throw new GatewayTypeError("InvalidType", "command", "ApplicationCommandResolvable", true);
      }
    }

    return {
      guildId,
      commandId: commandId ?? (defaultCommand ? this.client.application.id : null),
    };
  }

  // Reads the cached permissions of a command, if the client caches them.
  async #cached(
    guildId: string,
    commandId: string,
  ): Promise<CacheEntityTypes["applicationCommandPermissions"] | undefined> {
    const store = this.client.cache?.applicationCommandPermissions;
    if (!store) return undefined;

    const key = applicationCommandPermissionsKey(this.client.application.id, guildId, commandId);
    return this.client.guardCache(
      "applicationCommandPermissions",
      "get",
      key,
      () => store.get(key),
      undefined,
    );
  }

  // Keeps what the API answered in the cache, where the next permissions update merges into it.
  async #remember(data: APIGuildApplicationCommandPermissions): Promise<void> {
    const store = this.client.cache?.applicationCommandPermissions;
    if (!store) return;

    const key = applicationCommandPermissionsKey(data.application_id, data.guild_id, data.id);
    await this.client.guardCache(
      "applicationCommandPermissions",
      "set",
      key,
      () => store.set(key, data),
      undefined,
    );
  }
}
