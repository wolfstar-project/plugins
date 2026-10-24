import { definePlugin } from "@wolfstar/http-framework";
import type { OpenTelemetryInteractionsOptions } from "./lib/attributes.js";
import { attachInteractionTracing } from "./lib/interactions.js";

/**
 * The options of {@link openTelemetryPlugin}.
 */
export interface OpenTelemetryPluginOptions {
  /**
   * Opens a span for every interaction (command, component, modal; autocomplete on request), carrying its name, where it
   * came from, its outcome and its error if any. `true` takes the defaults, `false` turns it off.
   *
   * @default true
   */
  interactions?: boolean | OpenTelemetryInteractionsOptions;
}

/**
 * The OpenTelemetry plugin factory: opens one span per interaction, so the spans of the libraries the SDK instruments
 * (`pg`, `ioredis`, `undici`, ...) have the command or the handler that ran them as their parent.
 *
 * The spans are only exported when an SDK runs: start it with the `@wolfstar/plugin-opentelemetry/preload` entrypoint,
 * loaded with `--import`. Without one, `@opentelemetry/api` hands out no-op spans and this plugin costs nothing.
 *
 * @param options The spans to open.
 *
 * @example
 * ```ts
 * // node --import @wolfstar/plugin-opentelemetry/preload dist/main.mjs
 * import openTelemetryPlugin from '@wolfstar/plugin-opentelemetry/plugin';
 *
 * const client = new Client({ plugins: [openTelemetryPlugin({ interactions: { autocomplete: true } })] });
 * ```
 */
const openTelemetryPlugin = definePlugin((options: OpenTelemetryPluginOptions = {}) => {
  const { interactions = true } = options;

  return {
    name: "@wolfstar/plugin-opentelemetry",
    postInitialization(client) {
      if (!interactions) return;

      attachInteractionTracing(client, {
        commands: true,
        autocomplete: false,
        handlers: true,
        ...(interactions === true ? {} : interactions),
      });
    },
  };
});

export default openTelemetryPlugin;

export type { OpenTelemetryInteractionsOptions };
