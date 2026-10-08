import type { LogLevel } from "@wolfstar/http-framework";
import type { LogPayload } from "./types.js";

interface Derived {
  message: string;
  error: Error | undefined;
  context: Record<string, unknown> | undefined;
}

/**
 * Builds the {@link LogPayload} handed to every transport.
 *
 * `message`, `error` and `context` are derived from `values` the first time a transport reads them
 * and then memoised, so a logger that only has a {@link ConsoleTransport} never pays for them.
 *
 * @param level The level the entry was written at.
 * @param values The values passed to the logger method.
 * @param timestamp The moment the entry was created.
 */
export function createLogPayload(
  level: LogLevel,
  values: readonly unknown[],
  timestamp = new Date(),
): LogPayload {
  let derived: Derived | undefined;
  const derive = () => (derived ??= deriveFields(values));

  return {
    level,
    values,
    timestamp,
    get message() {
      return derive().message;
    },
    get error() {
      return derive().error;
    },
    get context() {
      return derive().context;
    },
  };
}

function deriveFields(values: readonly unknown[]): Derived {
  let error: Error | undefined;
  let context: Record<string, unknown> | undefined;
  const parts: string[] = [];

  for (const value of values) {
    if (value instanceof Error) {
      error ??= value;
    } else if (isPlainObject(value)) {
      context = { ...context, ...value };
    } else {
      parts.push(typeof value === "string" ? value : inspect(value));
    }
  }

  return { message: parts.join(" ") || error?.message || "", error, context };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function inspect(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
