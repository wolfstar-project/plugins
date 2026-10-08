import { resolve } from "node:path";
import { defineModule } from "@wolfstar/kit";
import type { ClientLoggerOptions } from "@wolfstar/http-framework";
import type { EvlogInlineOptions } from "./evlog-plugin";

/**
 * The options of the module: the logger's own, plus `evlog` to run evlog's `initLogger` and route
 * the logs through it.
 */
export interface LoggerModuleOptions extends ClientLoggerOptions {
  /**
   * Initialises evlog and adds an `EvlogTransport` to the logger. Needs the optional `evlog` peer.
   *
   * `true` takes evlog's defaults. An object holds the options evlog is initialised with (`env`,
   * `pretty`, `sampling`, `redact`, `pipeline`, ...) plus `tag` and `level` for the transport, and
   * `drain`: a file default-exporting `defineEvlogDrain(...)`, since a drain is a function and
   * cannot be written here.
   */
  evlog?: boolean | (EvlogInlineOptions & { drain?: EvlogSource });
}

/**
 * A path starting with `.` is resolved against the project root; an absolute path, a `file:` URL or
 * a package specifier is used as it is. Use `{ from, export }` for a named export.
 */
export type EvlogSource = string | { from: string; export?: string };

/**
 * The Stars module: listing `@wolfstar/plugin-logger/module` in `modules` in `stars.config` registers the logger
 * plugin with the options written there.
 *
 * @remarks
 * The options are written into the built entry, so they have to be JSON-serialisable (`level`, ...). Transports are
 * objects: set them through `ClientOptions.logger.transports`.
 *
 * With `evlog`, the module also runs evlog's `initLogger`. The options are written inline; only the drain, a
 * function, comes from a file of yours default-exporting `defineEvlogDrain(...)`, which Stars bundles with the bot and
 * calls with those options. The evlog plugin is registered before the logger one, which builds the logger from the
 * transports it finds.
 *
 * @example
 * ```ts
 * // stars.config.ts
 * export default defineConfig({ modules: [['@wolfstar/plugin-logger/module', { level: 20 }]] });
 * ```
 *
 * @example
 * ```ts
 * // stars.config.ts
 * export default defineConfig({
 * 	modules: [
 * 		[
 * 			'@wolfstar/plugin-logger/module',
 * 			{ evlog: { env: { service: 'bot' }, pipeline: true, drain: './src/evlog-drain.ts' } }
 * 		]
 * 	]
 * });
 * ```
 */
export default defineModule<LoggerModuleOptions>({
  meta: {
    name: "@wolfstar/plugin-logger",
    compatibility: { framework: ">=6.1.0" },
  },
  setup({ evlog, ...options }, ctx) {
    // Before the logger plugin, which builds the logger from the transports it finds.
    if (evlog) {
      const { drain, ...evlogOptions } = evlog === true ? ({} as { drain?: undefined }) : evlog;

      ctx.addPlugin(
        drain
          ? { ...resolveSource(drain, ctx.root), options: evlogOptions }
          : { from: "@wolfstar/plugin-logger/evlog/plugin", options: evlogOptions },
      );
    }

    ctx.addPlugin({ from: "@wolfstar/plugin-logger/plugin", options });
  },
});

function resolveSource(source: EvlogSource, root: string): { from: string; export?: string } {
  const { from, export: exportName } = typeof source === "string" ? { from: source } : source;

  return {
    from: from.startsWith(".") ? resolve(root, from) : from,
    ...(exportName && { export: exportName }),
  };
}
