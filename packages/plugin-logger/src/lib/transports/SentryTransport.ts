import { LogLevel } from "@wolfstar/http-framework";
import type { LogPayload, Transport } from "../types.js";

/**
 * The Sentry severity each {@link LogLevel} is reported with.
 */
const severities = new Map<LogLevel, SentrySeverity>([
  [LogLevel.Trace, "debug"],
  [LogLevel.Debug, "debug"],
  [LogLevel.Info, "info"],
  [LogLevel.Warn, "warning"],
  [LogLevel.Error, "error"],
  [LogLevel.Fatal, "fatal"],
]);

/**
 * A {@link Transport} forwarding entries to Sentry, defaulting to `error` and above so an
 * application's issue stream is not flooded with lifecycle logs.
 *
 * The Sentry client is injected rather than imported, exactly like {@link WinstonTransport} takes a
 * winston instance: this keeps `@wolfstar/plugin-logger` free of a runtime dependency on
 * `@sentry/node`, so consumers that do not use Sentry never pay for it.
 *
 * @example
 * ```ts
 * import * as Sentry from '@sentry/node';
 * import { SentryTransport } from '@wolfstar/plugin-logger';
 *
 * const transport = new SentryTransport({ client: Sentry });
 * ```
 */
export class SentryTransport implements Transport {
  public readonly level: LogLevel;

  /**
   * The Sentry client entries are reported to.
   */
  private readonly client: SentryClientLike;

  /**
   * @param options The transport options.
   */
  public constructor(options: SentryTransportOptions) {
    this.client = options.client;
    this.level = options.level ?? LogLevel.Error;
  }

  public log(payload: LogPayload): void {
    const severity = severities.get(payload.level) ?? "error";
    const error = payload.values.find((value): value is Error => value instanceof Error);

    // Prefer `captureException`: it is the only path producing a usable stack trace in Sentry.
    if (error) {
      this.client.captureException(error, { level: severity, extra: { values: payload.values } });
      return;
    }

    this.client.captureMessage(payload.values.map(stringify).join(" "), severity);
  }
}

function stringify(value: unknown): string {
  return typeof value === "string" ? value : inspect(value);
}

function inspect(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

export interface SentryTransportOptions {
  /**
   * The Sentry client entries are reported to. The `@sentry/node` module namespace satisfies this
   * shape, as does a manually built `Scope`.
   */
  client: SentryClientLike;

  /**
   * The lowest {@link LogLevel} forwarded to Sentry.
   *
   * @default LogLevel.Error
   */
  level?: LogLevel;
}

/**
 * The subset of Sentry's API {@link SentryTransport} relies on. Declared structurally so no
 * `@sentry/node` type import is needed.
 */
export interface SentryClientLike {
  captureException(exception: unknown, hint?: SentryCaptureHint): string;
  captureMessage(message: string, level?: SentrySeverity): string;
}

export interface SentryCaptureHint {
  level?: SentrySeverity;
  extra?: Record<string, unknown>;
}

/**
 * The severity levels Sentry accepts.
 */
export type SentrySeverity = "debug" | "error" | "fatal" | "info" | "log" | "warning";
