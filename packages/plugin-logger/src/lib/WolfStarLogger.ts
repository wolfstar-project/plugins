import { LogLevel, type ClientLoggerOptions, type ILogger } from "@wolfstar/http-framework";
import { ConsoleTransport } from "./transports/ConsoleTransport.js";
import type { LogPayload, Transport } from "./types.js";

/**
 * The {@link ILogger} implementation this plugin installs as `container.logger`.
 *
 * Unlike the framework's built-in `Logger`, which is hardcoded to `console`, this one fans every
 * entry out to a list of {@link Transport transports}. Each transport filters by its own
 * {@link Transport.level} on top of the logger's, so a Sentry sink can take only `error` and above
 * while the console keeps everything.
 */
export class WolfStarLogger implements ILogger {
  /**
   * The lowest level the logger writes.
   */
  public level: LogLevel;

  /**
   * The sinks every written entry is fanned out to.
   */
  public readonly transports: readonly Transport[];

  /**
   * @param options The logger options, as given through `ClientOptions.logger`.
   */
  public constructor(options: ClientLoggerOptions = {}) {
    this.level = options.level ?? LogLevel.Info;
    this.transports =
      options.transports && options.transports.length > 0
        ? [...options.transports]
        : [new ConsoleTransport()];
  }

  public has(level: LogLevel): boolean {
    return level >= this.level;
  }

  public trace(...values: readonly unknown[]): void {
    this.write(LogLevel.Trace, ...values);
  }

  public debug(...values: readonly unknown[]): void {
    this.write(LogLevel.Debug, ...values);
  }

  public info(...values: readonly unknown[]): void {
    this.write(LogLevel.Info, ...values);
  }

  public warn(...values: readonly unknown[]): void {
    this.write(LogLevel.Warn, ...values);
  }

  public error(...values: readonly unknown[]): void {
    this.write(LogLevel.Error, ...values);
  }

  public fatal(...values: readonly unknown[]): void {
    this.write(LogLevel.Fatal, ...values);
  }

  public write(level: LogLevel, ...values: readonly unknown[]): void {
    if (!this.has(level)) return;

    const payload: LogPayload = { level, values, timestamp: new Date() };

    for (const transport of this.transports) {
      if (level < (transport.level ?? this.level)) continue;

      // A sink must never take the caller down with it: swallow synchronous throws and rejections
      // alike, and report them through `console.error` since the logger itself is what failed.
      // `Promise.resolve` (rather than `instanceof Promise`) also catches thenables and Promises
      // from another realm, neither of which pass an `instanceof` check.
      try {
        const result = transport.log(payload);
        if (result) Promise.resolve(result).catch(reportTransportError);
      } catch (error) {
        reportTransportError(error);
      }
    }
  }

  /**
   * Closes every transport exposing a {@link Transport.close} method, so buffered entries are
   * flushed before the process exits.
   */
  public async close(): Promise<void> {
    await Promise.all(
      this.transports.map(async (transport) => {
        try {
          await transport.close?.();
        } catch (error) {
          reportTransportError(error);
        }
      }),
    );
  }
}

function reportTransportError(error: unknown): void {
  console.error("[plugin-logger] Transport failed to write an entry:", error);
}
