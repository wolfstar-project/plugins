import { defineModule } from "@wolfstar/kit";
import type { ClientLoggerOptions } from "@wolfstar/http-framework";

/**
 * The Stars module: listing `@wolfstar/plugin-logger/module` in `modules` in `stars.config` registers the logger
 * plugin with the options written there.
 *
 * @remarks
 * The options are written into the built entry, so they have to be JSON-serialisable (`level`, ...). Transports are
 * objects: set them through `ClientOptions.logger.transports`.
 *
 * @example
 * ```ts
 * // stars.config.ts
 * export default defineConfig({ modules: [['@wolfstar/plugin-logger/module', { level: 20 }]] });
 * ```
 */
export default defineModule<ClientLoggerOptions>({
  meta: {
    name: "@wolfstar/plugin-logger",
    compatibility: { framework: ">=6.1.0" },
  },
  setup(options, ctx) {
    ctx.addPlugin({ from: "@wolfstar/plugin-logger/plugin", options });
  },
});
