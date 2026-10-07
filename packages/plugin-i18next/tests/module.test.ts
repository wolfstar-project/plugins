import type { ModuleContext } from "@wolfstar/kit";
import { describe, expect, test, vi } from "vitest";
import i18nextModule from "../src/module";

describe("i18nextModule", () => {
  test("GIVEN the module THEN it names the package and needs framework 6.1", () => {
    expect(i18nextModule.meta).toMatchObject({
      name: "@wolfstar/plugin-i18next",
      compatibility: { framework: ">=6.1.0" },
    });
  });

  test("GIVEN options THEN setup registers the plugin with them and imports nothing", async () => {
    const ctx = { addPlugin: vi.fn(), addImports: vi.fn() };
    const options = { defaultLanguageDirectory: "/langs" };

    await i18nextModule.setup!(options, ctx as unknown as ModuleContext);

    expect(ctx.addPlugin).toHaveBeenCalledExactlyOnceWith({
      from: "@wolfstar/plugin-i18next/plugin",
      options,
    });
    expect(ctx.addImports).not.toHaveBeenCalled();
  });

  test.each([
    ["undefined", undefined],
    ["an empty object (as kit passes)", {}],
  ])("GIVEN no options (%s) THEN setup still registers the plugin", async (_label, options) => {
    const ctx = { addPlugin: vi.fn(), addImports: vi.fn() };

    await i18nextModule.setup!(options as never, ctx as unknown as ModuleContext);

    expect(ctx.addPlugin).toHaveBeenCalledExactlyOnceWith({
      from: "@wolfstar/plugin-i18next/plugin",
      options,
    });
  });
});
