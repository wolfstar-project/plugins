import {
  LogLevel,
  preGenericsInitialization,
  type Client,
  type ClientOptions,
  type ILogger,
} from "@wolfstar/http-framework";
import { describe, expect, test } from "vitest";
import { WolfStarLogger } from "../src/lib/WolfStarLogger";
import { LoggerPlugin } from "../src/register";

function run(options: Partial<ClientOptions>): ClientOptions {
  const resolved = options as ClientOptions;

  // The hook never touches `this`, so a stand-in is enough to exercise it without booting a client.
  LoggerPlugin[preGenericsInitialization].call({} as Client, resolved);

  return resolved;
}

describe("LoggerPlugin", () => {
  test("GIVEN no logger options THEN a WolfStarLogger is installed", () => {
    const options = run({});

    expect(options.logger?.instance).toBeInstanceOf(WolfStarLogger);
  });

  test("GIVEN a level THEN the installed logger honours it", () => {
    const options = run({ logger: { level: LogLevel.Debug } });

    const logger = options.logger!.instance as WolfStarLogger;

    expect(logger.level).toBe(LogLevel.Debug);
  });

  test("GIVEN an explicit instance THEN it is left untouched", () => {
    const instance = { has: () => true } as unknown as ILogger;
    const options = run({ logger: { instance } });

    expect(options.logger?.instance).toBe(instance);
  });

  test("GIVEN transports THEN they are passed to the logger", () => {
    const transport = { log: () => undefined };
    const options = run({ logger: { transports: [transport] } });

    const logger = options.logger!.instance as WolfStarLogger;

    expect(logger.transports).toEqual([transport]);
  });
});
