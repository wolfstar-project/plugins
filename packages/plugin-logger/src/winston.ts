import { LogLevel } from "@wolfstar/http-framework";
import type { Logger as WinstonLogger } from "winston";
import type { LogPayload, Transport } from "./lib/types.js";

/**
 * The npm-style winston level each {@link LogLevel} maps to. Winston has no `fatal` level in its
 * default `npm` levels, so it collapses into `error`.
 */
const levels = new Map<LogLevel, string>([
  [LogLevel.Trace, "silly"],
  [LogLevel.Debug, "debug"],
  [LogLevel.Info, "info"],
  [LogLevel.Warn, "warn"],
  [LogLevel.Error, "error"],
  [LogLevel.Fatal, "error"],
]);

/**
 * A {@link Transport} writing entries through a winston logger, which opens up winston's transport
 * ecosystem (file, syslog, HTTP, and alike) without this package having to reimplement any of it.
 *
 * The winston instance is injected so this package never imports winston at runtime; it is an
 * optional peer dependency, and only consumers importing `@wolfstar/plugin-logger/winston` need it
 * installed.
 *
 * @example
 * ```ts
 * import { createLogger, transports } from 'winston';
 * import { WinstonTransport } from '@wolfstar/plugin-logger/winston';
 *
 * const transport = new WinstonTransport({
 * 	instance: createLogger({ transports: [new transports.File({ filename: 'bot.log' })] })
 * });
 * ```
 */
export class WinstonTransport implements Transport {
  public readonly level?: LogLevel;

  /**
   * The winston logger entries are written through.
   */
  private readonly instance: WinstonLogger;

  /**
   * @param options The transport options.
   */
  public constructor(options: WinstonTransportOptions) {
    this.instance = options.instance;
    this.level = options.level;
  }

  public log(payload: LogPayload): void {
    const [message, ...rest] = payload.values;

    this.instance.log({
      level: levels.get(payload.level) ?? "info",
      message: typeof message === "string" ? message : String(message),
      ...(rest.length > 0 ? { values: rest } : {}),
    });
  }

  public async close(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.instance.end(() => resolve());
    });
  }
}

export interface WinstonTransportOptions {
  /**
   * The winston logger entries are written through.
   */
  instance: WinstonLogger;

  /**
   * The lowest {@link LogLevel} this transport accepts.
   *
   * @default undefined // the logger's level applies
   */
  level?: LogLevel;
}
