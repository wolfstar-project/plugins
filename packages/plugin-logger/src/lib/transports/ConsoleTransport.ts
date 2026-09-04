import { LogLevel } from "@wolfstar/http-framework";
import type { LogPayload, Transport } from "../types.js";

/**
 * The `console` method each {@link LogLevel} is written with, mirroring the framework's built-in
 * `Logger` so the default output does not change when this plugin is installed.
 */
const consoleMethods = new Map<LogLevel, ConsoleTransportMethod>([
  [LogLevel.Trace, "trace"],
  [LogLevel.Debug, "debug"],
  [LogLevel.Info, "info"],
  [LogLevel.Warn, "warn"],
  [LogLevel.Error, "error"],
  [LogLevel.Fatal, "error"],
]);

/**
 * The default {@link Transport}, writing every entry to the matching `console` method.
 *
 * It carries no dependencies, and is what a {@link WolfStarLogger} falls back to when no transport
 * is configured.
 */
export class ConsoleTransport implements Transport {
  public readonly level?: LogLevel;

  /**
   * @param options The transport options.
   */
  public constructor(options: ConsoleTransportOptions = {}) {
    this.level = options.level;
  }

  public log(payload: LogPayload): void {
    const method = consoleMethods.get(payload.level);
    if (method) console[method](...payload.values);
  }
}

export interface ConsoleTransportOptions {
  /**
   * The lowest {@link LogLevel} this transport accepts.
   *
   * @default undefined // the logger's level applies
   */
  level?: LogLevel;
}

/**
 * The `console` methods {@link ConsoleTransport} can write to.
 */
export type ConsoleTransportMethod = "debug" | "error" | "info" | "trace" | "warn";
