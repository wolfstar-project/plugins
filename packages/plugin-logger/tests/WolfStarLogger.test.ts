import { LogLevel } from "@wolfstar/http-framework";
import { describe, expect, test, vi } from "vitest";
import type { LogPayload, Transport } from "../src/lib/types";
import { WolfStarLogger } from "../src/lib/WolfStarLogger";

function createTransport(level?: LogLevel) {
  const payloads: LogPayload[] = [];
  const transport: Transport = {
    level,
    log: (payload) => {
      payloads.push(payload);
    },
  };

  return { payloads, transport };
}

describe("WolfStarLogger", () => {
  test("GIVEN no transports THEN falls back to a console transport", () => {
    const logger = new WolfStarLogger();

    expect(logger.transports).toHaveLength(1);
    expect(logger.level).toBe(LogLevel.Info);
  });

  test("GIVEN an entry below the level THEN it is dropped", () => {
    const { payloads, transport } = createTransport();
    const logger = new WolfStarLogger({ level: LogLevel.Warn, transports: [transport] });

    logger.info("dropped");
    logger.warn("kept");

    expect(payloads).toHaveLength(1);
    expect(payloads[0].values).toEqual(["kept"]);
    expect(payloads[0].level).toBe(LogLevel.Warn);
  });

  test("GIVEN LogLevel.None THEN every entry is silenced", () => {
    const { payloads, transport } = createTransport();
    const logger = new WolfStarLogger({ level: LogLevel.None, transports: [transport] });

    logger.trace("a");
    logger.debug("b");
    logger.info("c");
    logger.warn("d");
    logger.error("e");
    logger.fatal("f");

    expect(payloads).toHaveLength(0);
  });

  test("GIVEN a level THEN has reports it correctly", () => {
    const logger = new WolfStarLogger({ level: LogLevel.Warn });

    expect(logger.has(LogLevel.Info)).toBe(false);
    expect(logger.has(LogLevel.Warn)).toBe(true);
    expect(logger.has(LogLevel.Fatal)).toBe(true);
  });

  test("GIVEN multiple transports THEN every one receives the entry", () => {
    const first = createTransport();
    const second = createTransport();
    const logger = new WolfStarLogger({
      level: LogLevel.Trace,
      transports: [first.transport, second.transport],
    });

    logger.info("fan out");

    expect(first.payloads).toHaveLength(1);
    expect(second.payloads).toHaveLength(1);
  });

  test("GIVEN a transport with its own level THEN it filters on top of the logger's", () => {
    const verbose = createTransport();
    const errorsOnly = createTransport(LogLevel.Error);
    const logger = new WolfStarLogger({
      level: LogLevel.Trace,
      transports: [verbose.transport, errorsOnly.transport],
    });

    logger.debug("noise");
    logger.error("boom");

    expect(verbose.payloads).toHaveLength(2);
    expect(errorsOnly.payloads).toHaveLength(1);
    expect(errorsOnly.payloads[0].values).toEqual(["boom"]);
  });

  test("GIVEN a throwing transport THEN the error does not propagate", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const healthy = createTransport();
    const broken: Transport = {
      log: () => {
        throw new Error("sink is down");
      },
    };
    const logger = new WolfStarLogger({ transports: [broken, healthy.transport] });

    expect(() => logger.error("still logged")).not.toThrow();
    expect(healthy.payloads).toHaveLength(1);
    expect(spy).toHaveBeenCalledOnce();

    spy.mockRestore();
  });

  test("GIVEN a rejecting async transport THEN the rejection is caught", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const broken: Transport = { log: () => Promise.reject(new Error("network down")) };
    const logger = new WolfStarLogger({ transports: [broken] });

    logger.error("boom");
    await vi.waitFor(() => expect(spy).toHaveBeenCalledOnce());

    spy.mockRestore();
  });

  test("GIVEN a transport rejecting through a thenable THEN the rejection is caught", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const broken: Transport = {
      // A thenable is not `instanceof Promise`, unlike a native Promise — this is deliberately
      // reproducing that case, hence the lint exception.
      log: () =>
        ({
          // oxlint-disable-next-line unicorn/no-thenable
          then: (_resolve: unknown, reject: (reason: unknown) => void) =>
            reject(new Error("thenable rejected")),
        }) as unknown as Promise<void>,
    };
    const logger = new WolfStarLogger({ transports: [broken] });

    logger.error("boom");
    await vi.waitFor(() => expect(spy).toHaveBeenCalledOnce());

    spy.mockRestore();
  });

  test("GIVEN close THEN every closable transport is closed", async () => {
    const close = vi.fn();
    const logger = new WolfStarLogger({ transports: [{ log: () => undefined, close }] });

    await logger.close();

    expect(close).toHaveBeenCalledOnce();
  });

  test("GIVEN a timestamp THEN it is attached to the payload", () => {
    const { payloads, transport } = createTransport();
    const logger = new WolfStarLogger({ transports: [transport] });

    logger.info("timed");

    expect(payloads[0].timestamp).toBeInstanceOf(Date);
  });
});
