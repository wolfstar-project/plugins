import { LogLevel } from "@wolfstar/http-framework";
import type { Log } from "evlog";
import type { LogPayload, Transport } from "./lib/types.js";

/**
 * The evlog method each {@link LogLevel} maps to. evlog's simple API has the same six levels, so
 * nothing collapses.
 */
const methods = new Map<LogLevel, EvlogMethod>([
  [LogLevel.Trace, "trace"],
  [LogLevel.Debug, "debug"],
  [LogLevel.Info, "info"],
  [LogLevel.Warn, "warn"],
  [LogLevel.Error, "error"],
  [LogLevel.Fatal, "fatal"],
]);

/**
 * A {@link Transport} handing entries over to evlog as structured events.
 *
 * This transport does not format or deliver anything itself: evlog owns the whole pipeline, and the
 * entry goes through it like any other event. Configure `initLogger` once at startup and everything
 * evlog offers applies to the bot's logs: drains (Axiom, OTLP, Datadog, Sentry, ClickHouse, Loki,
 * file system, and alike), enrichers, head and tail sampling, redaction. evlog's Sentry drain also
 * makes {@link SentryTransport} redundant when evlog is already the sink.
 *
 * Entries are written in evlog's object form, because only structured events flow through the drain
 * pipeline. The message, the plain objects (spread as fields) and the `Error` (serialised with its
 * `cause` chain) the caller passed each land in their own field instead of a flattened string.
 *
 * The evlog `log` is injected so this package never imports evlog at runtime; it is an optional
 * peer dependency, and only consumers importing `@wolfstar/plugin-logger/evlog` need it installed.
 *
 * @example
 * ```ts
 * import { initLogger, log } from 'evlog';
 * import { createAxiomDrain } from 'evlog/axiom';
 * import { createDrainPipeline } from 'evlog/pipeline';
 * import { EvlogTransport } from '@wolfstar/plugin-logger/evlog';
 *
 * const drain = createDrainPipeline()(createAxiomDrain());
 * initLogger({ env: { service: 'bot' }, drain });
 *
 * // `drain` is flushed when the logger closes, so buffered events survive a shutdown.
 * const transport = new EvlogTransport({ instance: log, drain });
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
   * The drain pipeline flushed on {@link EvlogTransport.close}.
   */
  private readonly drain: EvlogFlushable | undefined;

  /**
   * @param options The transport options.
   */
  public constructor(options: EvlogTransportOptions) {
    this.instance = options.instance;
    this.level = options.level;
    this.tag = options.tag ?? "http-framework";
    this.drain = options.drain;
  }

  public log(payload: LogPayload): void {
    const method = methods.get(payload.level);
    if (!method) return;

    // The reserved fields come last so a context key can never overwrite them.
    this.instance[method]({
      ...payload.context,
      tag: this.tag,
      ...(payload.message && { message: payload.message }),
      ...(payload.error && { error: payload.error }),
    });
  }

  /**
   * Flushes the drain pipeline, if one was given. evlog batches events, so without this the last
   * ones are lost when the process exits.
   */
  public async close(): Promise<void> {
    await this.drain?.flush();
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

  /**
   * The drain pipeline given to `initLogger` (what `createDrainPipeline()(adapter)` returns), so it
   * is flushed when the logger closes.
   *
   * @default undefined // nothing to flush
   */
  drain?: EvlogFlushable;
}

/**
 * The part of evlog's `PipelineDrain` {@link EvlogTransport} relies on.
 */
export interface EvlogFlushable {
  flush(): Promise<void>;
}

/**
 * The evlog methods {@link EvlogTransport} can write to.
 */
export type EvlogMethod = "debug" | "error" | "fatal" | "info" | "trace" | "warn";
