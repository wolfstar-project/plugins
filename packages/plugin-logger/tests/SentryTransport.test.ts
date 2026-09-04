import { LogLevel } from "@wolfstar/http-framework";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { SentryTransport, type SentryClientLike } from "../src/lib/transports/SentryTransport";
import { WolfStarLogger } from "../src/lib/WolfStarLogger";

let client: SentryClientLike;

beforeEach(() => {
  client = {
    captureException: vi.fn(() => "event-id"),
    captureMessage: vi.fn(() => "event-id"),
  };
});

describe("SentryTransport", () => {
  test("GIVEN no level THEN it defaults to Error", () => {
    expect(new SentryTransport({ client }).level).toBe(LogLevel.Error);
  });

  test("GIVEN a logger THEN only error and above reach Sentry", () => {
    const logger = new WolfStarLogger({
      level: LogLevel.Trace,
      transports: [new SentryTransport({ client })],
    });

    logger.trace("a");
    logger.debug("b");
    logger.info("c");
    logger.warn("d");
    logger.error("boom");
    logger.fatal("worse");

    expect(client.captureMessage).toHaveBeenCalledTimes(2);
    expect(client.captureException).not.toHaveBeenCalled();
  });

  test("GIVEN an Error value THEN captureException is used", () => {
    const error = new Error("payment declined");
    const transport = new SentryTransport({ client });

    transport.log({ level: LogLevel.Error, values: ["context", error], timestamp: new Date() });

    expect(client.captureException).toHaveBeenCalledWith(error, {
      level: "error",
      extra: { values: ["context", error] },
    });
    expect(client.captureMessage).not.toHaveBeenCalled();
  });

  test("GIVEN no Error value THEN captureMessage is used with the joined values", () => {
    const transport = new SentryTransport({ client });

    transport.log({ level: LogLevel.Fatal, values: ["cannot", { id: 1 }], timestamp: new Date() });

    expect(client.captureMessage).toHaveBeenCalledWith('cannot {"id":1}', "fatal");
  });

  test.each([
    [LogLevel.Warn, "warning"],
    [LogLevel.Error, "error"],
    [LogLevel.Fatal, "fatal"],
  ] as const)("GIVEN level %s THEN the severity is %s", (level, severity) => {
    const transport = new SentryTransport({ client, level: LogLevel.Trace });

    transport.log({ level, values: [new Error("x")], timestamp: new Date() });

    expect(client.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ level: severity }),
    );
  });

  test("GIVEN a lowered level THEN warnings are forwarded too", () => {
    const logger = new WolfStarLogger({
      level: LogLevel.Trace,
      transports: [new SentryTransport({ client, level: LogLevel.Warn })],
    });

    logger.warn("close to the limit");

    expect(client.captureMessage).toHaveBeenCalledWith("close to the limit", "warning");
  });
});
