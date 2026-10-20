import { defineModule } from "@wolfstar/kit";
import type { InternationalizationOptions } from "./lib/types";

/**
 * The Stars module: listing `@wolfstar/plugin-i18next/module` in `modules` in `stars.config` registers the i18next
 * plugin with the options written under its `i18n` key.
 *
 * @remarks
 * The `[specifier, options]` tuple of `modules` still works: its options are merged over the `i18n` key, so they
 * win.
 *
 * The options are written into the built entry, so they have to be JSON-serialisable. `fetchLanguage` and the
 * `hmr.options` functions are not: set `fetchLanguage` through `ClientOptions.i18n`.
 *
 * @example
 * ```ts
 * // stars.config.ts
 * export default defineConfig({
 *   modules: ['@wolfstar/plugin-i18next/module'],
 *   i18n: { defaultLanguageDirectory: './languages' },
 * });
 * ```
 */
export default defineModule<InternationalizationOptions>({
  meta: {
    name: "@wolfstar/plugin-i18next",
    configKey: "i18n",
    compatibility: { framework: ">=6.1.0" },
  },
  setup(options, ctx) {
    ctx.addPlugin({ from: "@wolfstar/plugin-i18next/plugin", options });
  },
});

declare module "@wolfstar/schema" {
  interface StarsConfig {
    i18n?: InternationalizationOptions;
  }
}
