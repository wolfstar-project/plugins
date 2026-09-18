import { LogLevel } from "@wolfstar/http-framework";
import type { ConsolaInstance } from "consola";
import type { LogPayload, Transport } from "./lib/types.js";

/**
 * The consola method each {@link LogLevel} is written with.
 */
const methods = new Map<LogLevel, ConsolaMethod>([
  [LogLevel.Trace, "trace"],
  [LogLevel.Debug, "debug"],
  [LogLevel.Info, "info"],
  [LogLevel.Warn, "warn"],
  [LogLevel.Error, "error"],
  [LogLevel.Fatal, "fatal"],
]);

/**
 * A {@link Transport} writing entries through a consola instance, for the colourful, reporter-driven
 * console output consola is built around.
 *
 * The instance is injected so this package never imports consola at runtime; it is an optional peer
 * dependency, and only consumers importing `@wolfstar/plugin-logger/consola` need it installed.
 *
 * @example
 * ```ts
 * import { consola } from 'consola';
 * import { ConsolaTransport } from '@wolfstar/plugin-logger/consola';
 *
 * const transport = new ConsolaTransport({ instance: consola });
 * ```
 */
export class ConsolaTransport implements Transport {
  public readonly level?: LogLevel;

  /**
   * The consola instance entries are written through.
   */
  private readonly instance: ConsolaInstance;

  /**
   * @param options The transport options.
   */
  public constructor(options: ConsolaTransportOptions) {
    this.instance = options.instance;
    this.level = options.level;
  }

  public log(payload: LogPayload): void {
    const method = methods.get(payload.level);
    if (!method) return;

    const [message, ...rest] = payload.values;
    this.instance[method](message, ...rest);
  }
}

export interface ConsolaTransportOptions {
  /**
   * The consola instance entries are written through.
   */
  instance: ConsolaInstance;

  /**
   * The lowest {@link LogLevel} this transport accepts.
   *
   * @default undefined // the logger's level applies
   */
  level?: LogLevel;
}

/**
 * The consola methods {@link ConsolaTransport} can write to.
 */
export type ConsolaMethod = "debug" | "error" | "fatal" | "info" | "trace" | "warn";
