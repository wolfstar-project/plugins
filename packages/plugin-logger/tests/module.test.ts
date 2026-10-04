import type { ModuleContext } from "@wolfstar/kit";
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
});
