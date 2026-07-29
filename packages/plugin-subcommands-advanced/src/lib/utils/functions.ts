import { SlashCommandSubcommandBuilder } from "@discordjs/builders";
import { Collection } from "@discordjs/collection";
import { container, type Command } from "@wolfstar/http-framework";
import type { SlashSubcommandResolvable, SubcommandMappingCollection } from "./types.js";

/**
 * Registry of direct subcommands keyed by parent command name, then subcommand name.
 */
export const subCommandsRegistry: Collection<
  string,
  Collection<string, SubcommandMappingCollection>
> = new Collection();

/**
 * Registry of grouped subcommands keyed by parent → group → subcommand name.
 */
export const subCommandsGroupRegistry: Collection<
  string,
  Collection<string, Collection<string, SubcommandMappingCollection>>
> = new Collection();

/**
 * Normalize slash subcommand input into a builder.
 */
export function parseSlashSubcommand(
  subcommand: SlashSubcommandResolvable,
): SlashCommandSubcommandBuilder {
  if (typeof subcommand === "function") {
    const builder = new SlashCommandSubcommandBuilder();
    return subcommand(builder, container) ?? builder;
  }

  if (subcommand instanceof SlashCommandSubcommandBuilder) {
    return subcommand;
  }

  if (
    typeof subcommand === "object" &&
    subcommand !== null &&
    "toJSON" in subcommand &&
    typeof subcommand.toJSON === "function"
  ) {
    const json = (subcommand as { toJSON: () => { name: string; description: string } }).toJSON();
    return new SlashCommandSubcommandBuilder().setName(json.name).setDescription(json.description);
  }

  const data = subcommand as { name: string; description: string };
  return new SlashCommandSubcommandBuilder().setName(data.name).setDescription(data.description);
}

/**
 * Stable method name linked on the parent command for a direct subcommand.
 */
export function subcommandMethodName(subcommandName: string): string {
  return `__wolfstar_sc_${subcommandName}`;
}

/**
 * Stable method name linked on the parent command for a grouped subcommand.
 */
export function subcommandGroupMethodName(groupName: string, subcommandName: string): string {
  return `__wolfstar_sc_${groupName}_${subcommandName}`;
}

/**
 * Register a command piece as a direct subcommand of `parentCommandName`.
 */
export function analyzeSubCommandParsed(
  piece: Command,
  parentCommandName: string,
  subcommand: SlashSubcommandResolvable,
): Command {
  const subcommandParsed = parseSlashSubcommand(subcommand);
  const subcommandName = subcommandParsed.name;
  const methodName = subcommandMethodName(subcommandName);
  const entry: SubcommandMappingCollection = {
    slashCommand: subcommandParsed,
    commandPiece: piece,
    methodName,
  };

  const registry = subCommandsRegistry.ensure(parentCommandName, () => new Collection());
  registry.set(subcommandName, entry);

  return piece;
}

/**
 * Register a command piece as a subcommand inside a group of `parentCommandName`.
 */
export function analyzeSubcommandGroupParsed(
  piece: Command,
  parentCommandName: string,
  groupName: string,
  subcommand: SlashSubcommandResolvable,
): Command {
  const subcommandParsed = parseSlashSubcommand(subcommand);
  const subcommandName = subcommandParsed.name;
  const methodName = subcommandGroupMethodName(groupName, subcommandName);
  const entry: SubcommandMappingCollection = {
    slashCommand: subcommandParsed,
    commandPiece: piece,
    methodName,
  };

  const parentRegistry = subCommandsGroupRegistry.ensure(parentCommandName, () => new Collection());
  const groupRegistry = parentRegistry.ensure(groupName, () => new Collection());
  groupRegistry.set(subcommandName, entry);

  return piece;
}
