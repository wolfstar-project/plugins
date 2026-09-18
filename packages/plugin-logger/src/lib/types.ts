import type { LogLevel } from "@wolfstar/http-framework";

/**
 * A single log entry, as handed over to every {@link Transport} registered on a
 * {@link Logger}.
 */
export interface LogPayload {
  /**
   * The level the entry was written at.
   */
  readonly level: LogLevel;

  /**
   * The values passed to the logger method, forwarded as-is.
   */
  readonly values: readonly unknown[];

  /**
   * The moment the entry was created, captured before any transport runs.
   */
  readonly timestamp: Date;
}

/**
 * A sink a {@link Logger} writes entries to.
 *
 * Transports are the extension point that replaces forking the package: implement this interface to
 * add a custom sink, and pass the instance through `ClientLoggerOptions.transports`.
 */
export interface Transport {
  /**
   * The lowest {@link LogLevel} this transport accepts. Entries below it are dropped before
   * {@link Transport.log} is called, independently from the logger's own level.
   *
   * @default undefined // the logger's level applies
   */
  readonly level?: LogLevel;

  /**
   * Writes an entry to the underlying sink.
   *
   * A rejected promise or a thrown error is caught by the logger and reported to `console.error`,
   * so a broken sink never interrupts the caller.
   *
   * @param payload The entry to write.
   */
  log(payload: LogPayload): void | Promise<void>;

  /**
   * Flushes and releases the underlying sink, when it holds one.
   */
  close?(): void | Promise<void>;
}
