import { defineModule } from "@wolfstar/kit";
import type { InternationalizationOptions } from "./lib/types";

/**
 * The Stars module: listing `@wolfstar/plugin-i18next/module` in `modules` in `stars.config` registers the i18next
 * plugin with the options written there.
 *
 * @remarks
 * The options are written into the built entry, so they have to be JSON-serialisable. `fetchLanguage` and the
 * `hmr.options` functions are not: set `fetchLanguage` through `ClientOptions.i18n`.
 *
 * @example
 * ```ts
 * // stars.config.ts
 * export default defineConfig({
 *   modules: [['@wolfstar/plugin-i18next/module', { defaultLanguageDirectory: './languages' }]],
 * });
 * ```
 */
export default defineModule<InternationalizationOptions>({
  meta: {
    name: "@wolfstar/plugin-i18next",
    compatibility: { framework: ">=6.1.0" },
  },
  setup(options, ctx) {
    ctx.addPlugin({ from: "@wolfstar/plugin-i18next/plugin", options });
  },
});
