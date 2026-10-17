// Type-level test, checked by the root `typecheck` script through `tsconfig.consumption.json`: the application command
// managers and structure have the shapes of discord.js's, and their resolvable types accept what discord.js's do.
import type { Collection } from "@discordjs/collection";
import type {
  APIApplicationCommand,
  APIApplicationCommandOption,
  Locale,
  RESTPostAPIApplicationCommandsJSONBody,
} from "discord-api-types/v10";
import type {
  ApplicationCommand,
  ApplicationCommandData,
  ApplicationCommandDataResolvable,
  ApplicationCommandManager,
  ApplicationCommandOption,
  ApplicationCommandPermissionIdResolvable,
  ApplicationCommandPermissions,
  ApplicationCommandPermissionsManager,
  ApplicationCommandResolvable,
  FetchApplicationCommandOptions,
  GatewayClient,
  Guild,
  GuildApplicationCommandManager,
  PermissionsBitField,
  Role,
  User,
} from "../../src/index.js";

declare const client: GatewayClient;
declare const guild: Guild;
declare const command: ApplicationCommand;
declare const apiCommand: APIApplicationCommand;
declare const option: APIApplicationCommandOption;
declare const role: Role;
declare const user: User;
declare const builder: { toJSON(): RESTPostAPIApplicationCommandsJSONBody };
declare const locale: Locale;

// The managers hang off the application, the guild, and the command.
export const global: ApplicationCommandManager = client.application.commands;
export const local: GuildApplicationCommandManager = guild.commands;
export const guildCommands: GuildApplicationCommandManager = client.guilds.commands("1");
export const guildId: string = local.guildId;
export const maybeGuildId: string | null = global.guildId;
export const permissions: ApplicationCommandPermissionsManager = global.permissions;
export const ownPermissions: ApplicationCommandPermissionsManager = command.permissions;
export const manager: ApplicationCommandManager = command.manager;

// Fetching one command, or every command.
export const all: Promise<Collection<string, ApplicationCommand>> = global.fetch();
export const allInGuild: Promise<Collection<string, ApplicationCommand>> = global.fetch({
  guildId: "1",
  locale: "fr",
  withLocalizations: true,
});
export const one: Promise<ApplicationCommand> = global.fetch("1");
export const oneInGuild: Promise<ApplicationCommand> = global.fetch({ id: "1", guildId: "2" });
export const options: FetchApplicationCommandOptions = { locale, withLocalizations: false };

// Resolvables.
export const resolvables: ApplicationCommandResolvable[] = [command, apiCommand, "1"];
export const dataResolvables: ApplicationCommandDataResolvable[] = [
  { name: "awoo", description: "Howl", defaultMemberPermissions: ["Administrator"] },
  { name: "awoo", description: "Howl", options: [option] },
  builder,
];
export const data: ApplicationCommandData = { name: "awoo", nameLocalizations: null };
export const created: Promise<ApplicationCommand> = global.create(data);
export const createdInGuild: Promise<ApplicationCommand> = global.create(builder, "1");
export const overwritten: Promise<Collection<string, ApplicationCommand>> = global.set([
  data,
  builder,
]);
export const edited: Promise<ApplicationCommand> = global.edit(
  command,
  { description: "Awoo" },
  "1",
);
export const deleted: Promise<void> = local.delete("1");
declare const transformCommand: typeof ApplicationCommandManager.transformCommand;
export const transformed: RESTPostAPIApplicationCommandsJSONBody = transformCommand(builder);

// The structure.
export const optionList: ApplicationCommandOption[] | null = command.options;
export const defaultPermissions: Readonly<PermissionsBitField> | null =
  command.defaultMemberPermissions;
export const guildOfCommand: Guild | null = command.guild;
export const same: boolean = command.equals(apiCommand, true);
export const sameForeign: boolean = command.equals(null);
declare const optionsEqual: typeof ApplicationCommand.optionsEqual;
export const sameOptions: boolean = optionsEqual(command.options ?? [], [option], true);
export const editedCommand: Promise<ApplicationCommand> = command.setName("awoo");
export const deletedCommand: Promise<ApplicationCommand> = command.delete();

// Permissions.
export const own: Promise<ApplicationCommandPermissions[]> = permissions.fetch({ command });
export const everyCommand: Promise<
  ApplicationCommandPermissions[] | Collection<string, ApplicationCommandPermissions[]>
> = permissions.fetch({ guild });
export const ids: ApplicationCommandPermissionIdResolvable[] = [role, user, "1"];
export const has: Promise<boolean> = permissions.has({ command, permissionId: role });
export const set: Promise<ApplicationCommandPermissions[]> = permissions.set({
  command,
  permissions: [],
  token: "token",
});
export const removed: Promise<ApplicationCommandPermissions[]> = permissions.remove({
  command,
  token: "token",
  users: [user],
  roles: [role, "1"],
  channels: ["2"],
});

// @ts-expect-error a bearer token is needed to write permissions.
permissions.set({ command, permissions: [] });

// @ts-expect-error a number is no command.
export const badCommand: ApplicationCommandResolvable = 1;

// @ts-expect-error a number is no permission ID.
permissions.has({ command, permissionId: 1 });

// @ts-expect-error `guildId` of a guild's commands is read-only.
local.guildId = "1";
