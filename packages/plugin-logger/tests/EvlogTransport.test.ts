import { LogLevel } from "@wolfstar/http-framework";
import { initLogger, log, type DrainContext } from "evlog";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { EvlogTransport } from "../src/evlog";
import { Logger } from "../src/lib/Logger";

// The real evlog is used on purpose: what matters is the event the drain pipeline receives, not
// which `log` method was called.
let events: DrainContext["event"][];

beforeEach(() => {
  events = [];
  initLogger({
    env: { service: "bot" },
    silent: true,
    pretty: false,
    sampling: { rates: { trace: 100 } },
    drain: (ctx) => void events.push(ctx.event),
  });
});

function createLogger(options: Partial<ConstructorParameters<typeof EvlogTransport>[0]> = {}) {
  return new Logger({
    level: LogLevel.Trace,
    transports: [new EvlogTransport({ instance: log, ...options })],
  });
}

describe("EvlogTransport", () => {
  test("GIVEN a message and a context THEN the drain receives one structured event", async () => {
    createLogger().info("User joined", { guildId: "1", shard: 0 });

    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events[0]).toMatchObject({
      level: "info",
      service: "bot",
      tag: "http-framework",
      message: "User joined",
      guildId: "1",
      shard: 0,
    });
  });

  test("GIVEN a message and an Error THEN neither is lost", async () => {
    const error = new Error("payment declined", { cause: new Error("card expired") });

    createLogger().error("Failed to charge", { orderId: 7 }, error);

    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events[0]).toMatchObject({
      level: "error",
      message: "Failed to charge",
      orderId: 7,
      error: {
        name: "Error",
        message: "payment declined",
        cause: { message: "card expired" },
      },
    });
  });

  test.each([
    ["trace", "trace"],
    ["debug", "debug"],
    ["info", "info"],
    ["warn", "warn"],
    ["error", "error"],
    ["fatal", "fatal"],
  ] as const)("GIVEN logger.%s THEN the event level is %s", async (method, level) => {
    createLogger()[method]("hello");

    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events[0].level).toBe(level);
  });

  test("GIVEN a context key named like a reserved field THEN the log's own value wins", async () => {
    createLogger({ tag: "bot" }).info("real", { message: "spoofed", tag: "spoofed" });

    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events[0]).toMatchObject({ message: "real", tag: "bot" });
  });

  test("GIVEN an entry without any text THEN no empty message is sent", async () => {
    createLogger().info({ guildId: "1" });

    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events[0]).not.toHaveProperty("message");
  });

  test("GIVEN a drain THEN close flushes it", async () => {
    const drain = { flush: vi.fn(async () => undefined) };
    const transport = new EvlogTransport({ instance: log, drain });

    await transport.close();

    expect(drain.flush).toHaveBeenCalledOnce();
  });

  test("GIVEN no drain THEN close is a no-op", async () => {
    await expect(new EvlogTransport({ instance: log }).close()).resolves.toBeUndefined();
  });
});
