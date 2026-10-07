import { defineModule } from "@wolfstar/kit";
import type { ServerOptions } from "./lib/structures/http/Server";

/**
 * The Stars module: listing `@wolfstar/plugin-api/module` in `modules` in `stars.config` registers the API plugin with
 * the options written there.
 *
 * @remarks
 * The options are written into the built entry, so they have to be JSON-serialisable. Pass anything that is not
 * (such as the `server` options holding functions or buffers) through `ClientOptions.api`, which is merged over the
 * module options.
 *
 * @example
 * ```ts
 * // stars.config.ts
 * export default defineConfig({
 *   modules: [['@wolfstar/plugin-api/module', { prefix: '/api' }]],
 * });
 * ```
 */
export default defineModule<ServerOptions>({
  meta: {
    name: "@wolfstar/plugin-api",
    compatibility: { framework: ">=6.1.0" },
  },
  setup(options, ctx) {
    ctx.addPlugin({ from: "@wolfstar/plugin-api/plugin", options });
  },
});
