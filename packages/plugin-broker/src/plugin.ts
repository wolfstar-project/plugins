import { definePlugin } from "@wolfstar/http-framework";
import "./augmentations.js";
import type { BrokerConsumerOptions } from "./BrokerConsumer.js";
import { installBroker, startBroker } from "./hooks.js";

/**
 * The broker plugin: installs a `BrokerConsumer` from the plugin's options merged under `ClientOptions.broker`, and
 * starts it once the client is listening.
 *
 * @param pluginOptions The consumer options. Without a `redis` client the consumer throws, so pass it here or in
 * `ClientOptions.broker`.
 *
 * @example
 * ```ts
 * import brokerPlugin from '@wolfstar/plugin-broker/plugin';
 *
 * const client = new Client({ plugins: [brokerPlugin({ redis, stream: 'events', group: 'workers', consumer: 'w1' })] });
 * ```
 */
export default definePlugin((pluginOptions: Partial<BrokerConsumerOptions> = {}) => ({
  name: "@wolfstar/plugin-broker",
  preGenericsInitialization(_client, options) {
    const merged = { ...pluginOptions, ...options.broker };
    if (Object.keys(merged).length > 0) options.broker = merged as BrokerConsumerOptions;
    installBroker(options);
  },
  postListen: () => startBroker(),
}));
