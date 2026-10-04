import type { ClientOptions } from "@wolfstar/http-framework";
import { Logger } from "./lib/Logger";

/**
 * Installs a {@link Logger} as `options.logger.instance`, leaving an explicitly provided instance untouched. Shared by
 * the `./register` class plugin and the `./plugin` `definePlugin` factory.
 *
 * @param options The client options, mutated in place.
 */
export function installLogger(options: ClientOptions): void {
  options.logger ??= {};
  options.logger.instance ??= new Logger(options.logger);
}
