import type { ModuleContext } from "@wolfstar/kit";
import { describe, expect, test, vi } from "vitest";
import openTelemetryModule from "../src/module";
import openTelemetryPlugin from "../src/plugin";

describe("openTelemetryModule", () => {
  test("GIVEN the module THEN it names the package, owns the opentelemetry key and needs framework 6.1", () => {
    expect(openTelemetryModule.meta).toMatchObject({
      name: "@wolfstar/plugin-opentelemetry",
      configKey: "opentelemetry",
      compatibility: { framework: ">=6.1.0" },
    });
  });

  test("GIVEN options THEN setup registers the plugin with them and imports nothing", async () => {
    const ctx = { addPlugin: vi.fn(), addImports: vi.fn() };
    const options = { interactions: { autocomplete: true } };

    await openTelemetryModule.setup!(options, ctx as unknown as ModuleContext);

    expect(ctx.addPlugin).toHaveBeenCalledExactlyOnceWith({
      from: "@wolfstar/plugin-opentelemetry/plugin",
      options,
    });
    expect(ctx.addImports).not.toHaveBeenCalled();
  });
});

describe("openTelemetryPlugin", () => {
  test("GIVEN the factory THEN the plugin is named", () => {
    expect((openTelemetryPlugin() as { name: string }).name).toBe("@wolfstar/plugin-opentelemetry");
  });
});
