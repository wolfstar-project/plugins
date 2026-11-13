import { definePlugin } from "@wolfstar/http-framework";
import type {
  OpenTelemetryDispatchesOptions,
  OpenTelemetryInteractionsOptions,
} from "./lib/attributes.js";
import { attachDispatchTracing, canTraceDispatches } from "./lib/dispatches.js";
import { flushTraces } from "./lib/flush.js";
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

  /**
   * Opens a span for every gateway dispatch a `GatewayClient` of `@wolfstar/plugin-gateway` (0.17 or later) processes,
   * the root of a trace of its own, carrying its type, shard and guild. `true` takes the defaults, `false` turns it off.
   * Ignored on a client that does not connect to the gateway.
   *
   * @default true
   */
  dispatches?: boolean | OpenTelemetryDispatchesOptions;

  /**
   * Exports the spans left in the batch at the end of `GatewayClient#destroy` (`@wolfstar/plugin-gateway` 0.17 or
   * later), with {@link flushTraces}. Ignored on a client that does not connect to the gateway.
   *
   * @default true
   */
  flushOnDestroy?: boolean;
}

/**
 * The slice of a `GatewayClient` of `@wolfstar/plugin-gateway` the plugin flushes the traces from.
 */
interface DestroyHookHost {
  addDestroyHook(hook: () => unknown): () => void;
}

/**
 * The OpenTelemetry plugin factory: opens one span per interaction, and one per gateway dispatch on a `GatewayClient`,
 * so the spans of the libraries the SDK instruments (`pg`, `ioredis`, `undici`, ...) have the command, the handler or
 * the dispatch that ran them as their parent. On a `GatewayClient`, it also flushes the traces when it is destroyed.
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
  const { interactions = true, dispatches = true, flushOnDestroy = true } = options;

  return {
    name: "@wolfstar/plugin-opentelemetry",
    postInitialization(client) {
      if (interactions) {
        attachInteractionTracing(client, {
          commands: true,
          autocomplete: false,
          handlers: true,
          ...(interactions === true ? {} : interactions),
        });
      }

      if (dispatches && canTraceDispatches(client)) {
        attachDispatchTracing(client, { ignore: [], ...(dispatches === true ? {} : dispatches) });
      }

      const host = client as Partial<DestroyHookHost>;
      if (flushOnDestroy && typeof host.addDestroyHook === "function") {
        host.addDestroyHook(flushTraces);
      }
    },
  };
});

export default openTelemetryPlugin;

export type { OpenTelemetryDispatchesOptions, OpenTelemetryInteractionsOptions };
