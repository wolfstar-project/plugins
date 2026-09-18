import type { Transport } from "./lib/types.js";

export * from "./lib/transports/ConsoleTransport.js";
export * from "./lib/transports/SentryTransport.js";
export * from "./lib/types.js";
export * from "./lib/Logger.js";

declare module "@wolfstar/http-framework" {
  interface ClientLoggerOptions {
    /**
     * The sinks `@wolfstar/plugin-logger` fans every entry out to. Defaults to a single
     * `ConsoleTransport`, which reproduces the framework's built-in output.
     */
    transports?: readonly Transport[];
  }
}
