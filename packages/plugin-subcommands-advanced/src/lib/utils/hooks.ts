import type { SlashCommandBuilder } from "@discordjs/builders";
import type { Command } from "@wolfstar/http-framework";
import { subCommandsGroupRegistry, subCommandsRegistry } from "./functions.js";

/**
 * Optional hooks for parent commands that register chat-input commands imperatively
 * via {@link Command.registerApplicationCommands}. Prefer relying on the automatic
 * wiring performed by {@link SubcommandsAdvancedLoaderStrategy}; these helpers are
 * useful when you want to inspect or manually attach builders during registration.
 */
export const RegisterSubcommandsHooks = {
  /**
   * Attach registered direct subcommands onto a {@link SlashCommandBuilder}.
   */
  subcommands(piece: Command, context?: SlashCommandBuilder): void {
    const subcommands = subCommandsRegistry.get(piece.router.chatInputName ?? piece.name);
    if (!subcommands) {
      console.warn(
        `[plugin-subcommands-advanced]: No direct subcommands registered for parent "${piece.router.chatInputName ?? piece.name}".`,
      );
      return;
    }

    if (!context) return;

    for (const { slashCommand } of subcommands.values()) {
      context.addSubcommand(slashCommand);
    }
  },

  /**
   * Attach registered grouped subcommands onto matching groups on a {@link SlashCommandBuilder}.
   */
  groups(piece: Command, context?: SlashCommandBuilder): void {
    const groups = subCommandsGroupRegistry.get(piece.router.chatInputName ?? piece.name);
    if (!groups) {
      console.warn(
        `[plugin-subcommands-advanced]: No subcommand groups registered for parent "${piece.router.chatInputName ?? piece.name}".`,
      );
      return;
    }

    if (!context) return;

    for (const [groupName, commands] of groups) {
      const group = context.options.find((option) => {
        const data =
          "toJSON" in option && typeof option.toJSON === "function" ? option.toJSON() : null;
        return data && typeof data === "object" && "name" in data && data.name === groupName;
      }) as { addSubcommand?(subcommand: unknown): unknown } | undefined;

      if (!group?.addSubcommand) continue;

      for (const { slashCommand } of commands.values()) {
        group.addSubcommand(slashCommand);
      }
    }
  },
};
