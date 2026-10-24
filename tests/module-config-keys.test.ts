import { setupModules, type SetupModulesOptions, type StarsModule } from "@wolfstar/kit";
import { BUILT_IN_CONFIG_KEYS } from "@wolfstar/schema";
import { describe, expect, test, vi } from "vitest";
import apiModule from "../packages/plugin-api/src/module";
import brokerModule from "../packages/plugin-broker/src/module";
import cacheModule from "../packages/plugin-cache/src/module";
import gatewayModule from "../packages/plugin-gateway/src/module";
import i18nextModule from "../packages/plugin-i18next/src/module";
import loggerModule from "../packages/plugin-logger/src/module";
import openTelemetryModule from "../packages/plugin-opentelemetry/src/module";
import { scheduledTasksModule } from "../packages/plugin-scheduled-tasks/src/module";
import sharderModule from "../packages/plugin-sharder/src/module";
import subcommandsModule from "../packages/plugin-subcommands-advanced/src/module";

// The `stars.config` key each module owns. A key is part of the public configuration: renaming one breaks every
// project that writes it, so a change here is a breaking one.
const modules: [name: string, key: string, module: StarsModule<any>][] = [
  ["@wolfstar/plugin-api", "api", apiModule],
  ["@wolfstar/plugin-broker", "broker", brokerModule],
  ["@wolfstar/plugin-cache", "cache", cacheModule],
  ["@wolfstar/plugin-gateway", "gateway", gatewayModule],
  ["@wolfstar/plugin-i18next", "i18n", i18nextModule],
  ["@wolfstar/plugin-logger", "logger", loggerModule],
  ["@wolfstar/plugin-opentelemetry", "opentelemetry", openTelemetryModule],
  ["@wolfstar/plugin-scheduled-tasks", "scheduledTasks", scheduledTasksModule],
  ["@wolfstar/plugin-sharder", "sharder", sharderModule],
  ["@wolfstar/plugin-subcommands-advanced", "subcommandsAdvanced", subcommandsModule],
];

function install(
  entries: { module: StarsModule<any>; options?: Record<string, unknown> }[],
  moduleOptions: Record<string, unknown>,
) {
  const specifiers = new Map(entries.map(({ module }) => [module.meta.name, module]));
  const options: SetupModulesOptions = {
    config: {
      root: "/project",
      modules: entries.map(({ module, options }) => ({ specifier: module.meta.name, options })),
      moduleOptions,
    } as unknown as SetupModulesOptions["config"],
    hooks: { hook: vi.fn(), callHook: vi.fn() },
    load: async (specifier) => specifiers.get(specifier),
  };

  return setupModules(options);
}

describe("module config keys", () => {
  test.each(modules)("GIVEN %s THEN it owns the %s key", (name, key, module) => {
    expect(module.meta).toMatchObject({ name, configKey: key });
  });

  test("GIVEN every module THEN the keys are unique and none is a built-in key of stars.config", () => {
    const keys = modules.map(([, key]) => key);

    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(BUILT_IN_CONFIG_KEYS).not.toContain(key);
  });

  test("GIVEN every module installed together THEN each key is claimed by exactly one of them", async () => {
    const runtime = await install(
      modules.map(([, , module]) => ({ module })),
      {},
    );

    expect([...runtime.configKeys].sort()).toEqual(modules.map(([, key]) => key).sort());
  });

  describe.each([
    {
      key: "api",
      module: apiModule,
      plugin: "@wolfstar/plugin-api/plugin",
      options: { prefix: "/api" },
    },
    {
      key: "broker",
      module: brokerModule,
      plugin: "@wolfstar/plugin-broker/plugin",
      options: { stream: "wolfstar:events", group: "workers" },
    },
    {
      key: "i18n",
      module: i18nextModule,
      plugin: "@wolfstar/plugin-i18next/plugin",
      options: { defaultLanguageDirectory: "./languages" },
    },
    {
      key: "logger",
      module: loggerModule,
      plugin: "@wolfstar/plugin-logger/plugin",
      options: { level: 20 },
    },
    {
      key: "opentelemetry",
      module: openTelemetryModule,
      plugin: "@wolfstar/plugin-opentelemetry/plugin",
      options: { interactions: { autocomplete: true } },
    },
    {
      key: "scheduledTasks",
      module: scheduledTasksModule,
      plugin: "@wolfstar/plugin-scheduled-tasks/plugin",
      options: { queue: "tasks", bull: { connection: { host: "localhost", port: 6379 } } },
    },
  ])("the $key key", ({ key, module, plugin, options }) => {
    test("GIVEN options under the key THEN setup registers the plugin with them", async () => {
      const runtime = await install([{ module }], { [key]: options });

      expect(runtime.plugins).toContainEqual(expect.objectContaining({ from: plugin, options }));
    });

    test("GIVEN the same option in the tuple and under the key THEN the tuple wins", async () => {
      const [name, value] = Object.entries(options)[0]!;
      const runtime = await install([{ module, options: { [name]: "from-tuple" } }], {
        [key]: options,
      });

      expect(runtime.plugins).toContainEqual(
        expect.objectContaining({
          from: plugin,
          options: { ...options, [name]: "from-tuple" },
        }),
      );
      expect(value).not.toBe("from-tuple");
    });

    test("GIVEN no options anywhere THEN the module is still installed", async () => {
      const runtime = await install([{ module }], {});

      expect(runtime.modules.map((installed) => installed.name)).toContain(module.meta.name);
    });
  });

  test("GIVEN a key that is not a plain object THEN the module is rejected", async () => {
    await expect(install([{ module: apiModule }], { api: "/api" })).rejects.toMatchObject({
      code: "MODULE_INVALID",
    });
  });
});
