import type { ModuleContext } from "@wolfstar/kit";
import { describe, expect, test, vi } from "vitest";
import brokerModule from "../src/module";

describe("brokerModule", () => {
  test("GIVEN the module THEN it names the package and needs framework 6.1", () => {
    expect(brokerModule.meta).toMatchObject({
      name: "@wolfstar/plugin-broker",
      compatibility: { framework: ">=6.1.0" },
    });
  });

  test("GIVEN options THEN setup registers the plugin with them and imports nothing", async () => {
    const ctx = { addPlugin: vi.fn(), addImports: vi.fn() };
    const options = { stream: "events", group: "workers" };

    await brokerModule.setup!(options, ctx as unknown as ModuleContext);

    expect(ctx.addPlugin).toHaveBeenCalledExactlyOnceWith({
      from: "@wolfstar/plugin-broker/plugin",
      options,
    });
    expect(ctx.addImports).not.toHaveBeenCalled();
  });

  test("GIVEN no options THEN setup still registers the plugin", async () => {
    const ctx = { addPlugin: vi.fn(), addImports: vi.fn() };

    await brokerModule.setup!(undefined as never, ctx as unknown as ModuleContext);

    expect(ctx.addPlugin).toHaveBeenCalledExactlyOnceWith({
      from: "@wolfstar/plugin-broker/plugin",
      options: undefined,
    });
  });
});
