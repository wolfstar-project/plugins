import { LogLevel } from "@wolfstar/http-framework";
import { Writable } from "node:stream";
import { createLogger, format, transports } from "winston";
import { describe, expect, test } from "vitest";
import { Logger } from "../src/lib/Logger";
import { WinstonTransport } from "../src/winston";

// The real winston is used on purpose: what matters is the JSON line it ends up writing.
function setup(options: { level?: LogLevel } = {}) {
  const lines: Record<string, unknown>[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(JSON.parse(String(chunk)));
      callback();
    },
  });
  const instance = createLogger({
    level: "silly",
    format: format.json(),
    transports: [new transports.Stream({ stream })],
  });
  const transport = new WinstonTransport({ instance, ...options });
  const logger = new Logger({ level: LogLevel.Trace, transports: [transport] });

  return { lines, logger, transport };
}

describe("WinstonTransport", () => {
  test("GIVEN a message and a context THEN the context is spread next to the message", async () => {
    const { lines, logger, transport } = setup();

    logger.info("User joined", { guildId: "1" });
    await transport.close();

    expect(lines[0]).toMatchObject({ level: "info", message: "User joined", guildId: "1" });
  });

  test("GIVEN a message and an Error THEN the error is serialised with its stack", async () => {
    const { lines, logger, transport } = setup();
    const error = new Error("payment declined");

    logger.error("Failed to charge", error);
    await transport.close();

    expect(lines[0]).toMatchObject({
      level: "error",
      message: "Failed to charge",
      error: { name: "Error", message: "payment declined", stack: error.stack },
    });
  });

  test("GIVEN a non-string first value THEN it is not turned into [object Object]", async () => {
    const { lines, logger, transport } = setup();

    logger.info({ guildId: "1" });
    await transport.close();

    expect(lines[0]).toMatchObject({ message: "", guildId: "1" });
  });

  test("GIVEN trace and fatal THEN they map to silly and a flagged error", async () => {
    const { lines, logger, transport } = setup();

    logger.trace("t");
    logger.fatal("f");
    await transport.close();

    expect(lines[0]).toMatchObject({ level: "silly", message: "t" });
    expect(lines[1]).toMatchObject({ level: "error", message: "f", fatal: true });
  });

  test("GIVEN close THEN every written entry has reached the transports", async () => {
    const { lines, logger, transport } = setup();

    for (let index = 0; index < 50; index++) logger.info("entry", { index });
    await transport.close();

    expect(lines).toHaveLength(50);
  });

  test("GIVEN close called twice THEN the second call does not hang", async () => {
    const { transport } = setup();

    await transport.close();

    await expect(transport.close()).resolves.toBeUndefined();
  });
});
