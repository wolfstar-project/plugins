import type { ModuleContext } from "@wolfstar/kit";
import { describe, expect, test, vi } from "vitest";
import cacheModule from "../src/module";

describe("cacheModule", () => {
  test("GIVEN the module THEN it names the package and states no framework requirement", () => {
    expect(cacheModule.meta).toMatchObject({ name: "@wolfstar/plugin-cache" });
    expect(cacheModule.meta?.compatibility).toBeUndefined();
  });

  test("GIVEN setup THEN the package is auto-imported and no plugin is registered", async () => {
    const ctx = { addPlugin: vi.fn(), addImports: vi.fn() };

    await cacheModule.setup!({}, ctx as unknown as ModuleContext);

    expect(ctx.addImports).toHaveBeenCalledExactlyOnceWith("@wolfstar/plugin-cache");
    expect(ctx.addPlugin).not.toHaveBeenCalled();
  });

  test("GIVEN no options THEN setup still runs", async () => {
    const ctx = { addPlugin: vi.fn(), addImports: vi.fn() };

    await cacheModule.setup!(undefined as never, ctx as unknown as ModuleContext);

    expect(ctx.addImports).toHaveBeenCalledExactlyOnceWith("@wolfstar/plugin-cache");
  });
});
