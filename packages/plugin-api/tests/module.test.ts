import type { ModuleContext } from "@wolfstar/kit";
import { describe, expect, test, vi } from "vitest";
import apiModule from "../src/module";

describe("apiModule", () => {
  test("GIVEN the module THEN it names the package and needs framework 6.1", () => {
    expect(apiModule.meta).toMatchObject({
      name: "@wolfstar/plugin-api",
      compatibility: { framework: ">=6.1.0" },
    });
  });

  test("GIVEN options THEN setup registers the plugin with them and imports nothing", async () => {
    const ctx = { addPlugin: vi.fn(), addImports: vi.fn() };
    const options = { prefix: "/api" };

    await apiModule.setup!(options, ctx as unknown as ModuleContext);

    expect(ctx.addPlugin).toHaveBeenCalledExactlyOnceWith({
      from: "@wolfstar/plugin-api/plugin",
      options,
    });
    expect(ctx.addImports).not.toHaveBeenCalled();
  });

  test("GIVEN no options THEN setup still registers the plugin", async () => {
    const ctx = { addPlugin: vi.fn(), addImports: vi.fn() };

    await apiModule.setup!(undefined as never, ctx as unknown as ModuleContext);

    expect(ctx.addPlugin).toHaveBeenCalledExactlyOnceWith({
      from: "@wolfstar/plugin-api/plugin",
      options: undefined,
    });
  });
});
