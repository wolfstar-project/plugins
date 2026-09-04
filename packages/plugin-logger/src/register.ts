import {
  Client,
  Plugin,
  preGenericsInitialization,
  type ClientOptions,
} from "@wolfstar/http-framework";
import "./index";
import { WolfStarLogger } from "./lib/WolfStarLogger";

/**
 * Replaces the framework's built-in console logger with a {@link WolfStarLogger}, which fans entries
 * out to the transports configured through `ClientOptions.logger.transports`.
 *
 * Activate by importing the side-effecting entrypoint before creating the client:
 *
 * ```ts
 * import '@wolfstar/plugin-logger/register';
 * ```
 *
 * The hook runs at {@link preGenericsInitialization}, which is the last point before the client
 * resolves `container.logger`, and it leaves an explicitly provided `logger.instance` untouched.
 */
export class LoggerPlugin extends Plugin {
  public static [preGenericsInitialization](this: Client, options: ClientOptions): void {
    options.logger ??= {};
    options.logger.instance ??= new WolfStarLogger(options.logger);
  }
}

Client.plugins.registerPreGenericsInitializationHook(
  LoggerPlugin[preGenericsInitialization],
  "WolfStar-Logger-PreGenericsInitialization",
);
