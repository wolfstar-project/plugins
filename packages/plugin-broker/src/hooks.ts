import { container, type ClientOptions } from "@wolfstar/http-framework";
import type { Awaitable } from "@wolfstar/plugin-cache";
import { BrokerConsumer } from "./BrokerConsumer.js";

/**
 * Installs the {@link BrokerConsumer} configured through `ClientOptions.broker`, if any.
 *
 * @remarks
 * Only constructs the (inert) consumer: opening the Redis connection and reading the stream happen in
 * {@link startBroker}, once the client is listening.
 */
export function installBroker(options: ClientOptions): void {
  if (options.broker) container.broker = new BrokerConsumer(options.broker);
}

/**
 * Starts the installed {@link BrokerConsumer}, if there is one.
 */
export function startBroker(): Awaitable<void> {
  return container.broker?.start();
}
