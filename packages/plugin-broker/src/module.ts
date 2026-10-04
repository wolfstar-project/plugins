import { defineModule } from "@wolfstar/kit";
import type { BrokerConsumerOptions } from "./BrokerConsumer.js";

/**
 * The Stars module: listing `@wolfstar/plugin-broker/module` in `modules` in `stars.config` registers the broker
 * plugin with the options written there.
 *
 * @remarks
 * The options are written into the built entry, so they have to be JSON-serialisable. `redis` is a client instance
 * and `consumer` is per-process, so neither can be written in `stars.config`: supply both through
 * `ClientOptions.broker`, which is shallow-merged over the module options (the module options are the base values
 * and `ClientOptions.broker` overrides them). TypeScript currently types `ClientOptions.broker` as the full
 * `BrokerConsumerOptions`, so `redis`, `stream`, `group` and `consumer` must all be present there. A missing `redis`
 * or `consumer` surfaces when the consumer starts (`postListen`), not when it is constructed.
 *
 * @example
 * ```ts
 * // stars.config.ts
 * export default defineConfig({
 *   modules: [['@wolfstar/plugin-broker/module', { stream: 'wolfstar:events', group: 'workers' }]],
 * });
 * ```
 */
export default defineModule<Partial<BrokerConsumerOptions>>({
  meta: {
    name: "@wolfstar/plugin-broker",
    compatibility: { framework: ">=6.1.0" },
  },
  setup(options, ctx) {
    ctx.addPlugin({ from: "@wolfstar/plugin-broker/plugin", options });
  },
});
