import {
  Client,
  Plugin,
  postListen,
  preGenericsInitialization,
  type ClientOptions,
} from "@wolfstar/http-framework";
import type { Awaitable } from "@wolfstar/plugin-cache";
import "./augmentations.js";
import "./index.js";
import { installBroker, startBroker } from "./hooks.js";

/**
 * Installs the `BrokerConsumer` configured through `ClientOptions.broker`, if any.
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
    installBroker(options);
  }

  public static [postListen](this: Client): Awaitable<void> {
    return startBroker();
  }
}

Client.plugins
  .registerPreGenericsInitializationHook(
    BrokerPlugin[preGenericsInitialization],
    "WolfStar-Broker-PreGenericsInitialization",
  )
  .registerPostListenHook(BrokerPlugin[postListen], "WolfStar-Broker-PostListen");
