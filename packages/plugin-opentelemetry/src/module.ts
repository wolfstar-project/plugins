import { defineModule } from "@wolfstar/kit";
import type { OpenTelemetryPluginOptions } from "./plugin.js";

/**
 * The Stars module: listing `@wolfstar/plugin-opentelemetry/module` in `modules` in `stars.config` registers the
 * OpenTelemetry plugin with the options written under its `opentelemetry` key.
 *
 * @remarks
 * The module registers the plugin, which opens the spans. It cannot start the SDK: that has to happen before the bot
 * imports anything, so load `@wolfstar/plugin-opentelemetry/preload` with `--import`.
 *
 * The `[specifier, options]` tuple of `modules` still works: its options are merged over the `opentelemetry` key, so
 * they win.
 *
 * @example
 * ```ts
 * // stars.config.ts
 * export default defineConfig({
 *   modules: ['@wolfstar/plugin-opentelemetry/module'],
 *   opentelemetry: { interactions: { autocomplete: true } }
 * });
 * ```
 */
export default defineModule<OpenTelemetryPluginOptions>({
  meta: {
    name: "@wolfstar/plugin-opentelemetry",
    configKey: "opentelemetry",
    compatibility: { framework: ">=6.1.0" },
  },
  setup(options, ctx) {
    ctx.addPlugin({ from: "@wolfstar/plugin-opentelemetry/plugin", options });
  },
});

declare module "@wolfstar/schema" {
  interface StarsConfig {
    opentelemetry?: OpenTelemetryPluginOptions;
  }
}
