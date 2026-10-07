import { Client, LogLevel, container, definePlugin, type ILogger } from "@wolfstar/http-framework";
import { describe, expect, test } from "vitest";
import { Logger } from "../src/lib/Logger";
import loggerPlugin from "../src/plugin";

const base = { discordPublicKey: "a".repeat(64), discordToken: "token" };

function createClient(options: ConstructorParameters<typeof Client>[0]): Client {
  return new Client(options);
}

describe("loggerPlugin", () => {
  test("GIVEN the factory THEN the plugin is named and runs before the others", () => {
    const plugin = loggerPlugin() as { name: string; enforce?: string };

    expect(plugin.name).toBe("@wolfstar/plugin-logger");
    expect(plugin.enforce).toBe("pre");
  });

  test("GIVEN no options THEN a Logger is installed on the container", () => {
    createClient({ ...base, plugins: [loggerPlugin()] });

    expect(container.logger).toBeInstanceOf(Logger);
  });

  test("GIVEN factory options THEN the logger honours them", () => {
    createClient({ ...base, plugins: [loggerPlugin({ level: LogLevel.Debug })] });

    expect((container.logger as Logger).level).toBe(LogLevel.Debug);
  });

  test("GIVEN ClientOptions.logger THEN it is merged over the factory options", () => {
    createClient({
      ...base,
      logger: { level: LogLevel.Error },
      plugins: [loggerPlugin({ level: LogLevel.Debug })],
    });

    expect((container.logger as Logger).level).toBe(LogLevel.Error);
  });

  test("GIVEN an explicit instance THEN it is left untouched", () => {
    const instance = { has: () => true, error: () => {} } as unknown as ILogger;

    createClient({ ...base, logger: { instance }, plugins: [loggerPlugin()] });

    expect(container.logger).toBe(instance);
  });

  test("GIVEN another plugin that logs in preGenericsInitialization THEN the logger is already installed", () => {
    let seen: unknown;
    const spy = definePlugin({
      name: "spy",
      preGenericsInitialization: (_client, options) => {
        seen = options.logger?.instance;
      },
    });

    createClient({ ...base, plugins: [spy, loggerPlugin()] });

    expect(seen).toBeInstanceOf(Logger);
  });
});
