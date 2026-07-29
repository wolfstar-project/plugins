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

  for (const group of snapshot.options ?? []) {
    if (group.type === ApplicationCommandOptionType.SubcommandGroup) {
      resolver.addSubcommandGroup(groupDataWithoutSubcommands(group));
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
