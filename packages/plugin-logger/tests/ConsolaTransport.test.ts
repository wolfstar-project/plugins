import { LogLevel } from "@wolfstar/http-framework";
import { createConsola } from "consola";
import { describe, expect, test } from "vitest";
import { ConsolaTransport } from "../src/consola";
import { Logger } from "../src/lib/Logger";

function setup() {
  const entries: { type: string; args: unknown[] }[] = [];
  const instance = createConsola({
    level: 5,
    reporters: [{ log: (entry) => void entries.push({ type: entry.type, args: entry.args }) }],
  });
  const logger = new Logger({
    level: LogLevel.Trace,
    transports: [new ConsolaTransport({ instance })],
  });

  return { entries, logger };
}

describe("ConsolaTransport", () => {
  test.each([
    ["trace", "trace"],
    ["debug", "debug"],
    ["info", "info"],
    ["warn", "warn"],
    ["error", "error"],
    ["fatal", "fatal"],
  ] as const)("GIVEN logger.%s THEN consola receives a %s entry", (method, type) => {
    const { entries, logger } = setup();

    logger[method]("hello");

    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe(type);
  });

  test("GIVEN several values THEN consola receives them untouched", () => {
    const { entries, logger } = setup();
    const error = new Error("boom");

    logger.error("Failed", { id: 1 }, error);

    expect(entries[0].args).toEqual(["Failed", { id: 1 }, error]);
  });
});
