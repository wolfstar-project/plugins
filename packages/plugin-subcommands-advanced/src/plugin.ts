import { definePlugin } from "@wolfstar/http-framework";
import "./index.js";
import { installSubcommandsStrategy } from "./hooks.js";

/**
 * The advanced subcommands plugin: installs the loader strategy that wires modular child command classes onto their
 * parent chat-input commands after load.
 *
 * @example
 * ```ts
 * import subcommandsPlugin from '@wolfstar/plugin-subcommands-advanced/plugin';
 *
 * const client = new Client({ plugins: [subcommandsPlugin()] });
 * ```
 */
export default definePlugin(() => ({
  name: "@wolfstar/plugin-subcommands-advanced",
  postInitialization: () => installSubcommandsStrategy(),
}));
