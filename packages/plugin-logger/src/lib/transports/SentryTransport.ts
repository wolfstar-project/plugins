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
 * The `Sentry.logger` method each {@link LogLevel} is sent with.
 */
const logMethods = new Map<LogLevel, SentryLogMethod>([
  [LogLevel.Trace, "trace"],
  [LogLevel.Debug, "debug"],
  [LogLevel.Info, "info"],
  [LogLevel.Warn, "warn"],
  [LogLevel.Error, "error"],
  [LogLevel.Fatal, "fatal"],
]);

/**
 * A {@link Transport} forwarding entries to Sentry. What Sentry receives depends on the entry's
 * level, from the cheapest signal to the most prominent:
 *
 * - from {@link SentryTransportOptions.logLevel `logLevel`}: a Sentry Log (needs `enableLogs`);
 * - from {@link SentryTransportOptions.breadcrumbLevel `breadcrumbLevel`}, below `level`: a
 *   breadcrumb attached to the next issue;
 * - from {@link SentryTransportOptions.level `level`} (default `error`): an issue, so an
 *   application's issue stream is not flooded with lifecycle logs.
 *
 * Logs and breadcrumbs are off unless asked for. Sentry's default console integration already
 * records breadcrumbs for `console.*`, so enabling them next to a {@link ConsoleTransport} would
 * duplicate them.
 *
 * The Sentry client is injected rather than imported, exactly like {@link WinstonTransport} takes a
 * winston instance: this keeps `@wolfstar/plugin-logger` free of a runtime dependency on any Sentry
 * SDK, so it works with `@sentry/node`, `@sentry/bun` and the like alike.
 *
 * @example
 * ```ts
 * import * as Sentry from '@sentry/node';
 * import { SentryTransport } from '@wolfstar/plugin-logger';
 *
 * const transport = new SentryTransport({ client: Sentry, breadcrumbLevel: LogLevel.Info });
 * ```
 */
export class SentryTransport implements Transport {
  /**
   * The lowest level any of the enabled signals accepts.
   */
  public readonly level: LogLevel;

  /**
   * The Sentry client entries are reported to.
   */
  private readonly client: SentryClientLike;

  private readonly captureLevel: LogLevel;
  private readonly breadcrumbLevel: LogLevel | undefined;
  private readonly logLevel: LogLevel | undefined;
  private readonly flushTimeout: number;

  /**
   * @param options The transport options.
   */
  public constructor(options: SentryTransportOptions) {
    this.client = options.client;
    this.captureLevel = options.level ?? LogLevel.Error;
    this.breadcrumbLevel = options.breadcrumbLevel;
    this.logLevel = options.logLevel;
    this.flushTimeout = options.flushTimeout ?? 2000;

    if (this.breadcrumbLevel !== undefined && !this.client.addBreadcrumb) {
      throw new TypeError(
        "SentryTransport: `breadcrumbLevel` needs a client with `addBreadcrumb`.",
      );
    }

    if (this.logLevel !== undefined && !this.client.logger) {
      throw new TypeError(
        "SentryTransport: `logLevel` needs a client with `logger` (a Sentry SDK >= 9.41 initialised with `enableLogs`).",
      );
    }

    this.level = Math.min(
      this.captureLevel,
      this.breadcrumbLevel ?? this.captureLevel,
      this.logLevel ?? this.captureLevel,
    );
  }

  public log(payload: LogPayload): void {
    if (this.logLevel !== undefined && payload.level >= this.logLevel) this.sendLog(payload);

    if (payload.level >= this.captureLevel) {
      this.capture(payload);
    } else if (this.breadcrumbLevel !== undefined && payload.level >= this.breadcrumbLevel) {
      this.addBreadcrumb(payload);
    }
  }

  /**
   * Flushes the Sentry client so the last entries — typically the `fatal` one preceding an exit —
   * are delivered. The client itself stays open: it belongs to the application.
   */
  public async close(): Promise<void> {
    await this.client.flush?.(this.flushTimeout);
  }

  private capture(payload: LogPayload): void {
    const { error, context } = payload;
    const message = payload.message;
    const severity = severities.get(payload.level) ?? "error";

    const extra: Record<string, unknown> = {};
    if (context) extra.context = context;

    // Prefer `captureException`: it is the only path producing a usable stack trace in Sentry.
    if (error) {
      // The error's own message is already the issue title; only a message the caller added is news.
      if (message && message !== error.message) extra.message = message;
      this.client.captureException(error, { level: severity, extra });
      return;
    }

    this.client.captureMessage(message || "(empty log entry)", { level: severity, extra });
  }

  private addBreadcrumb(payload: LogPayload): void {
    this.client.addBreadcrumb?.({
      level: severities.get(payload.level) ?? "info",
      message: payload.message,
      category: "log",
      data: payload.context,
      timestamp: payload.timestamp.getTime() / 1000,
    });
  }

  private sendLog(payload: LogPayload): void {
    const method = logMethods.get(payload.level);
    if (!method) return;

    const attributes: Record<string, unknown> = { ...payload.context };
    if (payload.error) {
      attributes["error.name"] = payload.error.name;
      attributes["error.message"] = payload.error.message;
      attributes["error.stack"] = payload.error.stack;
    }

    this.client.logger?.[method](payload.message, attributes);
  }
}

export interface SentryTransportOptions {
  /**
   * The Sentry client entries are reported to. A Sentry SDK's module namespace satisfies this
   * shape, as does a manually built `Scope`.
   */
  client: SentryClientLike;

  /**
   * The lowest {@link LogLevel} reported as an issue.
   *
   * @default LogLevel.Error
   */
  level?: LogLevel;

  /**
   * The lowest {@link LogLevel} recorded as a breadcrumb, for entries below {@link level}. Needs a
   * client exposing `addBreadcrumb`.
   *
   * @default undefined // no breadcrumbs
   */
  breadcrumbLevel?: LogLevel;

  /**
   * The lowest {@link LogLevel} sent to Sentry Logs, regardless of {@link level}. Needs a client
   * exposing `logger`, and Sentry initialised with `enableLogs: true`.
   *
   * @default undefined // no Sentry Logs
   */
  logLevel?: LogLevel;

  /**
   * How long, in milliseconds, {@link SentryTransport.close} waits for the client to flush.
   *
   * @default 2000
   */
  flushTimeout?: number;
}

/**
 * The subset of Sentry's API {@link SentryTransport} relies on. Declared structurally so no
 * Sentry SDK type import is needed. Only the capture methods are required; the rest unlock the
 * optional signals.
 */
export interface SentryClientLike {
  captureException(exception: unknown, hint?: SentryCaptureHint): string;
  captureMessage(message: string, captureContext?: SentryCaptureHint | SentrySeverity): string;
  addBreadcrumb?(breadcrumb: SentryBreadcrumb): void;
  flush?(timeout?: number): PromiseLike<boolean>;
  logger?: SentryLoggerLike;
}

export interface SentryCaptureHint {
  level?: SentrySeverity;
  extra?: Record<string, unknown>;
}

export interface SentryBreadcrumb {
  level?: SentrySeverity;
  message?: string;
  category?: string;
  data?: Record<string, unknown>;
  /**
   * In seconds, as Sentry expects.
   */
  timestamp?: number;
}

/**
 * The severity levels Sentry accepts.
 */
export type SentrySeverity = "debug" | "error" | "fatal" | "info" | "log" | "warning";

/**
 * The `Sentry.logger` methods {@link SentryTransport} writes to.
 */
export type SentryLogMethod = "debug" | "error" | "fatal" | "info" | "trace" | "warn";

export type SentryLoggerLike = Record<
  SentryLogMethod,
  (message: string, attributes?: Record<string, unknown>) => void
>;
