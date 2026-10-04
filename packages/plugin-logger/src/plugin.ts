import { definePlugin, type ClientLoggerOptions } from "@wolfstar/http-framework";
import "./index";
import { installLogger } from "./hooks";

/**
 * The logger plugin: replaces the framework's console logger with a {@link Logger} fanning out to the configured
 * transports.
 *
 * @param pluginOptions The logger options. `ClientOptions.logger` is merged over them.
 *
 * @example
 * ```ts
 * import loggerPlugin from '@wolfstar/plugin-logger/plugin';
 *
 * const client = new Client({ plugins: [loggerPlugin({ level: LogLevel.Debug })] });
 * ```
 */
export default definePlugin((pluginOptions: ClientLoggerOptions = {}) => ({
  name: "@wolfstar/plugin-logger",
  enforce: "pre",
  preGenericsInitialization(_client, options) {
    options.logger = { ...pluginOptions, ...options.logger };
    installLogger(options);
  },
}));
