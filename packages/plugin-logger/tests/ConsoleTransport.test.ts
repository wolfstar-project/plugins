import { LogLevel } from "@wolfstar/http-framework";
import { describe, expect, test, vi } from "vitest";
import { ConsoleTransport } from "../src/lib/transports/ConsoleTransport";

function log(level: LogLevel, ...values: readonly unknown[]) {
  new ConsoleTransport().log({ level, values, timestamp: new Date() });
}

describe("ConsoleTransport", () => {
  test.each([
    [LogLevel.Trace, "trace"],
    [LogLevel.Debug, "debug"],
    [LogLevel.Info, "info"],
    [LogLevel.Warn, "warn"],
    [LogLevel.Error, "error"],
    [LogLevel.Fatal, "error"],
  ] as const)("GIVEN level %s THEN writes to console.%s", (level, method) => {
    const spy = vi.spyOn(console, method).mockImplementation(() => undefined);

    log(level, "message", 42);

    expect(spy).toHaveBeenCalledWith("message", 42);
    spy.mockRestore();
  });

  test("GIVEN an unmapped level THEN nothing is written", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    log(LogLevel.None, "never");

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("GIVEN a level option THEN it is exposed to the logger", () => {
    expect(new ConsoleTransport({ level: LogLevel.Warn }).level).toBe(LogLevel.Warn);
  });
});
