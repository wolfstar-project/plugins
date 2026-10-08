import { LogLevel } from "@wolfstar/http-framework";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createLogPayload } from "../src/lib/payload";
import { Logger } from "../src/lib/Logger";
import { SentryTransport, type SentryClientLike } from "../src/lib/transports/SentryTransport";

let client: SentryClientLike & {
  captureException: ReturnType<typeof vi.fn>;
  captureMessage: ReturnType<typeof vi.fn>;
  addBreadcrumb: ReturnType<typeof vi.fn>;
  flush: ReturnType<typeof vi.fn>;
  logger: Record<string, ReturnType<typeof vi.fn>>;
};

beforeEach(() => {
  client = {
    captureException: vi.fn(() => "event-id"),
    captureMessage: vi.fn(() => "event-id"),
    addBreadcrumb: vi.fn(),
    flush: vi.fn(async () => true),
    logger: {
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
    },
  };
});

describe("SentryTransport events", () => {
  test("GIVEN no level THEN it defaults to Error", () => {
    expect(new SentryTransport({ client }).level).toBe(LogLevel.Error);
  });

  test("GIVEN a logger THEN only error and above reach Sentry", () => {
    const logger = new Logger({
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
    expect(client.addBreadcrumb).not.toHaveBeenCalled();
    expect(client.logger.error).not.toHaveBeenCalled();
  });

  test("GIVEN a message and an Error THEN the exception carries the message as extra", () => {
    const error = new Error("payment declined");
    const transport = new SentryTransport({ client });

    transport.log(createLogPayload(LogLevel.Error, ["Failed to charge", { orderId: 7 }, error]));

    expect(client.captureException).toHaveBeenCalledWith(error, {
      level: "error",
      extra: { message: "Failed to charge", context: { orderId: 7 } },
    });
    expect(client.captureMessage).not.toHaveBeenCalled();
  });

  test("GIVEN only an Error THEN no message extra duplicates the exception", () => {
    const error = new Error("payment declined");
    const transport = new SentryTransport({ client });

    transport.log(createLogPayload(LogLevel.Error, [error]));

    expect(client.captureException).toHaveBeenCalledWith(error, { level: "error", extra: {} });
  });

  test("GIVEN no Error THEN captureMessage is used with the message and the context", () => {
    const transport = new SentryTransport({ client });

    transport.log(createLogPayload(LogLevel.Fatal, ["cannot", "continue", { id: 1 }]));

    expect(client.captureMessage).toHaveBeenCalledWith("cannot continue", {
      level: "fatal",
      extra: { context: { id: 1 } },
    });
  });

  test("GIVEN an entry without any text THEN captureMessage still gets a message", () => {
    const transport = new SentryTransport({ client });

    transport.log(createLogPayload(LogLevel.Error, [{ id: 1 }]));

    expect(client.captureMessage).toHaveBeenCalledWith(
      "(empty log entry)",
      expect.objectContaining({ level: "error" }),
    );
  });

  test.each([
    [LogLevel.Warn, "warning"],
    [LogLevel.Error, "error"],
    [LogLevel.Fatal, "fatal"],
  ] as const)("GIVEN level %s THEN the severity is %s", (level, severity) => {
    const transport = new SentryTransport({ client, level: LogLevel.Trace });

    transport.log(createLogPayload(level, [new Error("x")]));

    expect(client.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ level: severity }),
    );
  });

  test("GIVEN a lowered level THEN warnings are forwarded too", () => {
    const logger = new Logger({
      level: LogLevel.Trace,
      transports: [new SentryTransport({ client, level: LogLevel.Warn })],
    });

    logger.warn("close to the limit");

    expect(client.captureMessage).toHaveBeenCalledWith("close to the limit", {
      level: "warning",
      extra: {},
    });
  });
});

describe("SentryTransport breadcrumbs", () => {
  test("GIVEN a breadcrumb level THEN lower entries become breadcrumbs, not events", () => {
    const logger = new Logger({
      level: LogLevel.Trace,
      transports: [new SentryTransport({ client, breadcrumbLevel: LogLevel.Info })],
    });

    logger.debug("skipped");
    logger.info("user joined", { guildId: "1" });
    logger.error("boom");

    expect(client.addBreadcrumb).toHaveBeenCalledTimes(1);
    expect(client.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "info",
        message: "user joined",
        category: "log",
        data: { guildId: "1" },
        timestamp: expect.any(Number),
      }),
    );
    expect(client.captureMessage).toHaveBeenCalledTimes(1);
  });

  test("GIVEN a breadcrumb level THEN the transport accepts entries down to it", () => {
    const transport = new SentryTransport({ client, breadcrumbLevel: LogLevel.Debug });

    expect(transport.level).toBe(LogLevel.Debug);
  });

  test("GIVEN a client without addBreadcrumb THEN construction fails loudly", () => {
    const { addBreadcrumb: _unused, ...withoutBreadcrumbs } = client;

    expect(
      () => new SentryTransport({ client: withoutBreadcrumbs, breadcrumbLevel: LogLevel.Info }),
    ).toThrow(/addBreadcrumb/);
  });
});

describe("SentryTransport logs", () => {
  test("GIVEN a log level THEN entries from it are sent to Sentry Logs with their attributes", () => {
    const error = new Error("boom");
    const logger = new Logger({
      level: LogLevel.Trace,
      transports: [new SentryTransport({ client, logLevel: LogLevel.Info })],
    });

    logger.debug("skipped");
    logger.info("user joined", { guildId: "1" });
    logger.warn("slow", error);

    expect(client.logger.debug).not.toHaveBeenCalled();
    expect(client.logger.info).toHaveBeenCalledWith("user joined", { guildId: "1" });
    expect(client.logger.warn).toHaveBeenCalledWith("slow", {
      "error.name": "Error",
      "error.message": "boom",
      "error.stack": error.stack,
    });
  });

  test("GIVEN an entry at the capture level THEN it is sent as a log and as an event", () => {
    const transport = new SentryTransport({ client, logLevel: LogLevel.Info });

    transport.log(createLogPayload(LogLevel.Error, ["boom"]));

    expect(client.logger.error).toHaveBeenCalledWith("boom", {});
    expect(client.captureMessage).toHaveBeenCalledTimes(1);
  });

  test("GIVEN a client without logger THEN construction fails loudly", () => {
    const { logger: _unused, ...withoutLogger } = client;

    expect(() => new SentryTransport({ client: withoutLogger, logLevel: LogLevel.Info })).toThrow(
      /logger/,
    );
  });
});

describe("SentryTransport close", () => {
  test("GIVEN close THEN the client is flushed with the timeout", async () => {
    const transport = new SentryTransport({ client, flushTimeout: 500 });

    await transport.close();

    expect(client.flush).toHaveBeenCalledWith(500);
  });

  test("GIVEN no flushTimeout THEN it defaults to two seconds", async () => {
    await new SentryTransport({ client }).close();

    expect(client.flush).toHaveBeenCalledWith(2000);
  });

  test("GIVEN a client without flush THEN close is a no-op", async () => {
    const { flush: _unused, ...withoutFlush } = client;

    await expect(new SentryTransport({ client: withoutFlush }).close()).resolves.toBeUndefined();
  });
});
