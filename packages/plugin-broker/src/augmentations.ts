import type { BrokerConsumer, BrokerConsumerOptions } from "./BrokerConsumer.js";

declare module "@sapphire/pieces" {
  interface Container {
    /**
     * The {@link BrokerConsumer} installed from `ClientOptions.broker`, once constructed by
     * `preGenericsInitialization`. `BrokerListener` pieces bind to it as their default `emitter`.
     *
     * @remarks
     * Only actually set when `ClientOptions.broker` is configured, same as `container.gatewayClient` is only set
     * once a `GatewayClient` is constructed; declared non-optional so `"broker"` is accepted by
     * `Listener.Options.emitter`'s `Container`-key mapped type, which excludes optional properties.
     */
    broker: BrokerConsumer;
  }
}

declare module "@wolfstar/http-framework" {
  interface ClientOptions {
    /**
     * Configures a {@link BrokerConsumer}, started automatically once the client starts listening.
     */
    broker?: BrokerConsumerOptions;
  }
}
