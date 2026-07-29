import {
  Client,
  container,
  Plugin,
  postInitialization,
  type ClientOptions,
  type CommandStore,
} from "@wolfstar/http-framework";
import "./index.js";
import { SubcommandsAdvancedLoaderStrategy } from "./lib/utils/strategy.js";

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
    const store = container.stores.get("commands") as CommandStore;
    Object.defineProperty(store, "strategy", {
      value: new SubcommandsAdvancedLoaderStrategy(),
      configurable: true,
      enumerable: true,
      writable: true,
    });
  }
}

Client.plugins.registerPostInitializationHook(
  SubcommandsAdvancedPlugin[postInitialization]!,
  "WolfStar-SubcommandsAdvanced-PostInitialization",
);
