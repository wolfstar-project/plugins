import { container, type CommandStore } from "@wolfstar/http-framework";
import { SubcommandsAdvancedLoaderStrategy } from "./lib/utils/strategy.js";

/**
 * Installs the advanced subcommands loader strategy on the commands store, so modular child command classes are
 * wired onto their parent chat-input commands after load.
 */
export function installSubcommandsStrategy(): void {
  const store = container.stores.get("commands") as CommandStore;
  Object.defineProperty(store, "strategy", {
    value: new SubcommandsAdvancedLoaderStrategy(),
    configurable: true,
    enumerable: true,
    writable: true,
  });
}
