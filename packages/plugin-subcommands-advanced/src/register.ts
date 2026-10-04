import { Client, Plugin, postInitialization, type ClientOptions } from "@wolfstar/http-framework";
import "./index.js";
import { installSubcommandsStrategy } from "./hooks.js";

/**
 * Installs the advanced subcommands loader strategy so modular child command
 * classes are wired onto their parent chat-input commands after load.
 *
 * Activate by importing the side-effecting entrypoint before creating the client:
 *
 * ```ts
 * import '@wolfstar/plugin-subcommands-advanced/register';
 * ```
 */
export class SubcommandsAdvancedPlugin extends Plugin {
  public static [postInitialization](this: Client, _options: ClientOptions): void {
    installSubcommandsStrategy();
  }
}

Client.plugins.registerPostInitializationHook(
  SubcommandsAdvancedPlugin[postInitialization]!,
  "WolfStar-SubcommandsAdvanced-PostInitialization",
);
