import type { ModuleContext } from "@wolfstar/kit";
import { describe, expect, test, vi } from "vitest";
import sharderModule from "../src/module";

describe("sharderModule", () => {
  test("GIVEN the module THEN it names the package and states no framework requirement", () => {
    expect(sharderModule.meta).toMatchObject({ name: "@wolfstar/plugin-sharder" });
    expect(sharderModule.meta?.compatibility).toBeUndefined();
  });

  test("GIVEN setup THEN the package is auto-imported and no plugin is registered", async () => {
    const ctx = { addPlugin: vi.fn(), addImports: vi.fn() };

    await sharderModule.setup!({}, ctx as unknown as ModuleContext);

    expect(ctx.addImports).toHaveBeenCalledExactlyOnceWith("@wolfstar/plugin-sharder");
    expect(ctx.addPlugin).not.toHaveBeenCalled();
  });

  test("GIVEN no options THEN setup still runs", async () => {
    const ctx = { addPlugin: vi.fn(), addImports: vi.fn() };

    await sharderModule.setup!(undefined as never, ctx as unknown as ModuleContext);

    expect(ctx.addImports).toHaveBeenCalledExactlyOnceWith("@wolfstar/plugin-sharder");
  });
});
