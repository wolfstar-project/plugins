import { applicationCommandRegistry, CommandRouter, type Command } from "@wolfstar/http-framework";
import {
  ApplicationCommandOptionType,
  type APIApplicationCommandSubcommandGroupOption,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord-api-types/v10";
import { subCommandsGroupRegistry, subCommandsRegistry } from "./functions.js";
import type { SubcommandMappingCollection } from "./types.js";

const wiredParents = new WeakSet<Command>();

/**
 * Whether this piece is a parent that has registered modular subcommands.
 */
export function hasRegisteredSubcommands(parentName: string): boolean {
  return subCommandsRegistry.has(parentName) || subCommandsGroupRegistry.has(parentName);
}

/**
 * Install delegate methods on the parent and rebuild its chat-input resolver + router
 * so modular child command classes handle each subcommand.
 *
 * Must run after every command piece has been constructed (e.g. from
 * {@link CommandLoaderStrategy.onLoad}), so the registries contain every child.
 *
 * Delegates are installed on the parent **prototype** so reconstructed instances
 * (Store `loadAll` rebuilds pieces) still satisfy {@link CommandRouter}'s method checks.
 */
export function wireParentSubcommands(parent: Command): void {
  const parentName = parent.router.chatInputName;
  if (!parentName || !hasRegisteredSubcommands(parentName)) return;
  if (wiredParents.has(parent)) return;

  const ctor = parent.constructor as typeof Command;
  const existing = applicationCommandRegistry.get(ctor);
  const chatInput = existing?.chatInput;
  if (!chatInput) {
    console.warn(
      `[plugin-subcommands-advanced]: Parent command "${parentName}" has no chat-input registration; skipping wiring.`,
    );
    return;
  }

  const snapshot = chatInput.toJSON();
  applicationCommandRegistry.delete(ctor);

  const resolver = applicationCommandRegistry.ensure(ctor).makeChatInput();
  resolver.setCommand(baseCommandData(snapshot));

  for (const option of snapshot.options ?? []) {
    if (option.type === ApplicationCommandOptionType.SubcommandGroup) {
      resolver.addSubcommandGroup(groupDataWithoutSubcommands(option), getLinkedMethod(option));
      for (const subcommand of option.options ?? []) {
        resolver.addSubcommand(subcommand, getLinkedMethod(subcommand), option.name);
      }
    } else if (option.type === ApplicationCommandOptionType.Subcommand) {
      resolver.addSubcommand(option, getLinkedMethod(option));
    }
  }

  const direct = subCommandsRegistry.get(parentName);
  if (direct) {
    for (const entry of direct.values()) {
      installDelegate(ctor, parentName, entry);
      resolver.addSubcommand(entry.slashCommand, entry.methodName);
    }
  }

  const groups = subCommandsGroupRegistry.get(parentName);
  if (groups) {
    for (const [groupName, commands] of groups) {
      for (const entry of commands.values()) {
        installDelegate(ctor, parentName, entry);
        resolver.addSubcommand(entry.slashCommand, entry.methodName, groupName);
      }
    }
  }

  Object.defineProperty(parent, "router", {
    value: new CommandRouter(parent),
    configurable: true,
    enumerable: true,
    writable: false,
  });

  wiredParents.add(parent);
}

function baseCommandData(snapshot: RESTPostAPIChatInputApplicationCommandsJSONBody) {
  const { options: _options, ...rest } = snapshot;
  return rest;
}

function groupDataWithoutSubcommands(group: APIApplicationCommandSubcommandGroupOption) {
  const { options: _options, type: _type, ...rest } = group;
  return rest;
}

/**
 * `http-framework` links a subcommand (or group) option to its handler method by
 * defining a non-enumerable symbol property on the resolved option object. The
 * symbol is not exported, so it is recovered here by its description to preserve
 * framework-native subcommand routing when the resolver is rebuilt.
 */
const LINKED_METHOD_SYMBOL_DESCRIPTION = "decorated-command.method.link";

function getLinkedMethod(option: object): string | null {
  for (const symbol of Object.getOwnPropertySymbols(option)) {
    if (symbol.description === LINKED_METHOD_SYMBOL_DESCRIPTION) {
      return (Reflect.get(option, symbol) as string | undefined) ?? null;
    }
  }

  return null;
}

function installDelegate(
  parentCtor: typeof Command,
  parentName: string,
  entry: SubcommandMappingCollection,
): void {
  const { methodName } = entry;

  Object.defineProperty(parentCtor.prototype, methodName, {
    configurable: true,
    enumerable: false,
    writable: true,
    value(this: Command, interaction: Command.ApplicationCommandInteraction, args: object) {
      const resolved = lookupEntry(parentName, methodName);
      if (!resolved) {
        throw new Error(
          `[plugin-subcommands-advanced]: No child command registered for parent "${parentName}" method "${methodName}".`,
        );
      }
      return resolved.commandPiece.chatInputRun(interaction, args);
    },
  });
}

function lookupEntry(
  parentName: string,
  methodName: string,
): SubcommandMappingCollection | undefined {
  const direct = subCommandsRegistry.get(parentName);
  if (direct) {
    for (const entry of direct.values()) {
      if (entry.methodName === methodName) return entry;
    }
  }

  const groups = subCommandsGroupRegistry.get(parentName);
  if (groups) {
    for (const commands of groups.values()) {
      for (const entry of commands.values()) {
        if (entry.methodName === methodName) return entry;
      }
    }
  }

  return undefined;
}

/**
 * Reset subcommand registries (useful between tests).
 */
export function clearSubcommandRegistries(): void {
  subCommandsRegistry.clear();
  subCommandsGroupRegistry.clear();
}
