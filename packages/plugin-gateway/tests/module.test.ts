import type { ModuleContext } from "@wolfstar/kit";
import { describe, expect, test, vi } from "vitest";
import gatewayModule from "../src/module";

describe("gatewayModule", () => {
  test("GIVEN the module THEN it names the package and needs framework 6.1", () => {
    expect(gatewayModule.meta).toMatchObject({
      name: "@wolfstar/plugin-gateway",
      compatibility: { framework: ">=6.1.0" },
    });
  });

  test("GIVEN setup THEN the package is auto-imported and no plugin is registered", async () => {
    const ctx = { addPlugin: vi.fn(), addImports: vi.fn() };

    await gatewayModule.setup!({}, ctx as unknown as ModuleContext);

    expect(ctx.addImports).toHaveBeenCalledExactlyOnceWith("@wolfstar/plugin-gateway");
    expect(ctx.addPlugin).not.toHaveBeenCalled();
  });

  test("GIVEN no options THEN setup still runs", async () => {
    const ctx = { addPlugin: vi.fn(), addImports: vi.fn() };

    await gatewayModule.setup!(undefined as never, ctx as unknown as ModuleContext);

    expect(ctx.addImports).toHaveBeenCalledExactlyOnceWith("@wolfstar/plugin-gateway");
  });
});
