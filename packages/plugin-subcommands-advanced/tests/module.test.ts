import type { ModuleContext } from "@wolfstar/kit";
import { describe, expect, test, vi } from "vitest";
import subcommandsModule from "../src/module";

describe("subcommandsAdvancedModule", () => {
  test("GIVEN the module THEN it names the package and needs framework 6.1", () => {
    expect(subcommandsModule.meta).toMatchObject({
      name: "@wolfstar/plugin-subcommands-advanced",
      compatibility: { framework: ">=6.1.0" },
    });
  });

  test("GIVEN empty options THEN setup registers the plugin with them and imports nothing", async () => {
    const ctx = { addPlugin: vi.fn(), addImports: vi.fn() };

    await subcommandsModule.setup!({}, ctx as unknown as ModuleContext);

    expect(ctx.addPlugin).toHaveBeenCalledExactlyOnceWith({
      from: "@wolfstar/plugin-subcommands-advanced/plugin",
      options: {},
    });
    expect(ctx.addImports).not.toHaveBeenCalled();
  });

  test("GIVEN no options at all THEN setup still registers the plugin", async () => {
    const ctx = { addPlugin: vi.fn(), addImports: vi.fn() };

    await subcommandsModule.setup!(undefined as never, ctx as unknown as ModuleContext);

    expect(ctx.addPlugin).toHaveBeenCalledExactlyOnceWith({
      from: "@wolfstar/plugin-subcommands-advanced/plugin",
      options: undefined,
    });
  });
});
