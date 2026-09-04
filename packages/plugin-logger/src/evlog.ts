import { LogLevel } from "@wolfstar/http-framework";
import type { Log } from "evlog";
import type { LogPayload, Transport } from "./lib/types.js";

/**
 * The evlog method each {@link LogLevel} maps to. evlog exposes four levels, so `trace` collapses
 * into `debug` and `fatal` into `error`.
 */
const methods = new Map<LogLevel, EvlogMethod>([
  [LogLevel.Trace, "debug"],
  [LogLevel.Debug, "debug"],
  [LogLevel.Info, "info"],
  [LogLevel.Warn, "warn"],
  [LogLevel.Error, "error"],
  [LogLevel.Fatal, "error"],
]);

/**
 * A {@link Transport} writing entries through an evlog logger, for structured "wide event" logging
 * and the drain adapters evlog ships (OTLP, Axiom, Datadog, ClickHouse, and alike).
 *
 * evlog groups entries by a tag rather than by a logger name, so every entry written through this
 * transport carries {@link EvlogTransportOptions.tag}.
 *
 * The evlog instance is injected so this package never imports evlog at runtime; it is an optional
 * peer dependency, and only consumers importing `@wolfstar/plugin-logger/evlog` need it installed.
 *
 * @example
 * ```ts
 * import { log } from 'evlog';
 * import { EvlogTransport } from '@wolfstar/plugin-logger/evlog';
 *
 * const transport = new EvlogTransport({ instance: log, tag: 'bot' });
 * ```
 */
export class EvlogTransport implements Transport {
  public readonly level?: LogLevel;

  /**
   * The evlog logger entries are written through.
   */
  private readonly instance: Log;

  /**
   * The tag every entry is written under.
   */
  private readonly tag: string;

  /**
   * @param options The transport options.
   */
  public constructor(options: EvlogTransportOptions) {
    this.instance = options.instance;
    this.level = options.level;
    this.tag = options.tag ?? "http-framework";
  }

  public log(payload: LogPayload): void {
    const method = methods.get(payload.level);
    if (!method) return;

    const error = payload.values.find((value): value is Error => value instanceof Error);

    // evlog's `error` overload takes an `Error` directly and derives a structured error from it,
    // which is strictly better than flattening the stack into a message string.
    if (error && method === "error") {
      this.instance.error(error);
      return;
    }

    this.instance[method](this.tag, payload.values.map(stringify).join(" "));
  }
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.stack ?? value.message;

  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

export interface EvlogTransportOptions {
  /**
   * The evlog logger entries are written through.
   */
  instance: Log;

  /**
   * The lowest {@link LogLevel} this transport accepts.
   *
   * @default undefined // the logger's level applies
   */
  level?: LogLevel;

  /**
   * The tag every entry is written under.
   *
   * @default 'http-framework'
   */
  tag?: string;
}

/**
 * The evlog methods {@link EvlogTransport} can write to.
 */
export type EvlogMethod = "debug" | "error" | "info" | "warn";
