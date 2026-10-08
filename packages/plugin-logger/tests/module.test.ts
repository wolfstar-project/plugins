import type { ModuleContext } from "@wolfstar/kit";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test, vi } from "vitest";
import loggerModule from "../src/module";

describe("loggerModule", () => {
  test("GIVEN the module THEN it names the package and needs framework 6.1", () => {
    expect(loggerModule.meta).toMatchObject({
      name: "@wolfstar/plugin-logger",
      compatibility: { framework: ">=6.1.0" },
    });
  });

  test("GIVEN options THEN setup registers the plugin with them and imports nothing", async () => {
    const ctx = { addPlugin: vi.fn(), addImports: vi.fn() };
    const options = { level: 20 };

    await loggerModule.setup!(options, ctx as unknown as ModuleContext);

    expect(ctx.addPlugin).toHaveBeenCalledExactlyOnceWith({
      from: "@wolfstar/plugin-logger/plugin",
      options,
    });
    expect(ctx.addImports).not.toHaveBeenCalled();
  });

  // `evlog` is an optional peer: a type imported from it (or from the evlog plugin, which imports it)
  // ends up in `module.d.ts`, and fails to resolve for a consumer without evlog when `skipLibCheck`
  // is off.
  test("GIVEN the module source THEN it imports nothing from evlog nor from the evlog plugin", () => {
    const source = readFileSync(new URL("../src/module.ts", import.meta.url), "utf8");

    expect(source).not.toMatch(/from\s+["'](?:evlog|\.\/evlog)/);
  });

  describe("evlog", () => {
    const root = resolve("/project");

    function setup(options: Parameters<NonNullable<typeof loggerModule.setup>>[0]) {
      const ctx = { root, addPlugin: vi.fn(), addImports: vi.fn() };
      void loggerModule.setup!(options, ctx as unknown as ModuleContext);
      return ctx.addPlugin;
    }

    test("GIVEN evlog: true THEN the stock evlog plugin is registered before the logger one", () => {
      expect(setup({ level: 20, evlog: true }).mock.calls).toEqual([
        [{ from: "@wolfstar/plugin-logger/evlog/plugin", options: {} }],
        [{ from: "@wolfstar/plugin-logger/plugin", options: { level: 20 } }],
      ]);
    });

    test("GIVEN evlog: false THEN only the logger plugin is registered", () => {
      expect(setup({ evlog: false }).mock.calls).toEqual([
        [{ from: "@wolfstar/plugin-logger/plugin", options: {} }],
      ]);
    });

    test("GIVEN inline evlog options THEN they are the stock plugin's options", () => {
      const evlog = { env: { service: "bot" }, silent: true, pipeline: { batch: { size: 25 } } };

      expect(setup({ evlog })).toHaveBeenNthCalledWith(1, {
        from: "@wolfstar/plugin-logger/evlog/plugin",
        options: evlog,
      });
    });

    test("GIVEN a relative drain file THEN it replaces the stock plugin and receives the options", () => {
      const addPlugin = setup({ evlog: { env: { service: "bot" }, drain: "./src/drain.ts" } });

      expect(addPlugin.mock.calls).toEqual([
        [{ from: resolve(root, "src/drain.ts"), options: { env: { service: "bot" } } }],
        [{ from: "@wolfstar/plugin-logger/plugin", options: {} }],
      ]);
    });

    test("GIVEN a drain with an export name THEN the export is kept", () => {
      const addPlugin = setup({ evlog: { drain: { from: "/abs/drain.ts", export: "axiom" } } });

      expect(addPlugin).toHaveBeenNthCalledWith(1, {
        from: "/abs/drain.ts",
        export: "axiom",
        options: {},
      });
    });

    test("GIVEN a file: URL or a package specifier THEN it is passed as it is", () => {
      expect(setup({ evlog: { drain: "file:///project/drain.js" } })).toHaveBeenNthCalledWith(1, {
        from: "file:///project/drain.js",
        options: {},
      });
      expect(setup({ evlog: { drain: "my-drain" } })).toHaveBeenNthCalledWith(1, {
        from: "my-drain",
        options: {},
      });
    });
  });
});
