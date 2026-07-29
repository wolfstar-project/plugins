export { Command, Subcommand } from "./lib/structures/command.js";
export {
  RegisterAsSubcommand,
  RegisterAsSubcommandGroup,
  RegisterSubCommand,
  RegisterSubCommandGroup,
} from "./lib/utils/decorators.js";
export {
  analyzeSubCommandParsed,
  analyzeSubcommandGroupParsed,
  parseSlashSubcommand,
  subCommandsGroupRegistry,
  subCommandsRegistry,
  subcommandGroupMethodName,
  subcommandMethodName,
} from "./lib/utils/functions.js";
export { RegisterSubcommandsHooks } from "./lib/utils/hooks.js";
export { SubcommandsAdvancedLoaderStrategy } from "./lib/utils/strategy.js";
export type {
  PluginSubcommandOptions,
  RegisterSubCommandGroupOptions,
  RegisterSubCommandOptions,
  SlashSubcommandResolvable,
  SubcommandCommandOptions,
  SubcommandMappingCollection,
} from "./lib/utils/types.js";
export {
  clearSubcommandRegistries,
  hasRegisteredSubcommands,
  wireParentSubcommands,
} from "./lib/utils/wiring.js";

import type { PluginSubcommandOptions } from "./lib/utils/types.js";

declare module "@wolfstar/http-framework" {
  interface ClientOptions {
    /**
     * Options for `@wolfstar/plugin-subcommands-advanced`.
     */
    subcommandsAdvanced?: PluginSubcommandOptions;
  }
}
