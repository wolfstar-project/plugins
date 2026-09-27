import {
  Client,
  container,
  Plugin,
  postListen,
  preGenericsInitialization,
  type ClientOptions,
} from "@wolfstar/http-framework";
import type { Awaitable } from "@wolfstar/plugin-cache";
import "./index.js";
import { BrokerConsumer, type BrokerConsumerOptions } from "./BrokerConsumer.js";

/**
 * Installs the {@link BrokerConsumer} configured through `ClientOptions.broker`, if any.
 *
 * @remarks
 * Splits construction from starting it, matching where each is safe to run: `preGenericsInitialization` runs
 * synchronously during the base `Client` constructor, so it only constructs the (inert) `BrokerConsumer`, the same
 * way `plugin-logger`'s hook only constructs a `Logger`. Opening a Redis connection, running `XGROUP CREATE`, and
 * starting the read loop are asynchronous, so they run in `postListen` instead, which fires once `client.listen()`
 * has loaded every piece (including `BrokerListener`s) and started serving — the same point `GatewayClient.start`
 * calls `connect()` at, for the same reason.
 *
 * Activate by importing the side-effecting entrypoint before creating the client:
 *
 * ```ts
 * import '@wolfstar/plugin-broker/register';
 * ```
 */
export class BrokerPlugin extends Plugin {
  public static [preGenericsInitialization](this: Client, options: ClientOptions): void {
    if (options.broker) container.broker = new BrokerConsumer(options.broker);
  }

  public static [postListen](this: Client): Awaitable<void> {
    return container.broker?.start();
  }
}

Client.plugins
  .registerPreGenericsInitializationHook(
    BrokerPlugin[preGenericsInitialization],
    "WolfStar-Broker-PreGenericsInitialization",
  )
  .registerPostListenHook(BrokerPlugin[postListen], "WolfStar-Broker-PostListen");

declare module "@sapphire/pieces" {
  interface Container {
    /**
     * The {@link BrokerConsumer} installed from `ClientOptions.broker`, once constructed by
     * `preGenericsInitialization`. `BrokerListener` pieces bind to it as their default `emitter`.
     *
     * @remarks
     * Only actually set when `ClientOptions.broker` is configured, same as `container.gatewayClient` is only set
     * once a `GatewayClient` is constructed; declared non-optional so `"broker"` is accepted by
     * {@link Listener.Options.emitter}'s `Container`-key mapped type, which excludes optional properties.
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
