import { Client } from "@wolfstar/http-framework";
import type { ModuleContext } from "@wolfstar/kit";
import { describe, expect, test, vi } from "vitest";
import scheduledTasksModule, { version } from "../src/index.js";

vi.mock("bullmq", () => import("./fixtures/bullmq.js"));

describe("module", () => {
  test("GIVEN the default export THEN it is a module for framework 6.1 and later", () => {
    expect(scheduledTasksModule.meta).toEqual({
      name: "@wolfstar/plugin-scheduled-tasks",
      compatibility: { framework: ">=6.1.0" },
    });
  });

  test("GIVEN setup THEN it registers the runtime plugin with the options and the auto imports", async () => {
    const ctx = { addPlugin: vi.fn(), addImports: vi.fn() };
    const options = { queue: "tasks", bull: { connection: { host: "localhost", port: 6379 } } };

    await scheduledTasksModule.setup!(options, ctx as unknown as ModuleContext);

    expect(ctx.addPlugin).toHaveBeenCalledExactlyOnceWith({
      from: "@wolfstar/plugin-scheduled-tasks/plugin",
      options,
    });
    expect(ctx.addImports).toHaveBeenCalledExactlyOnceWith("@wolfstar/plugin-scheduled-tasks");
  });

  test("GIVEN the options THEN they survive the JSON round trip of the built entry", () => {
    const options = { queue: "tasks", bull: { connection: { host: "localhost", port: 6379 } } };

    expect(JSON.parse(JSON.stringify(options))).toEqual(options);
  });
});

describe("register", () => {
  test("GIVEN the register entrypoint THEN it registers no plugin hook", async () => {
    const before = Client.plugins.registry.size;

    await import("../src/register.js");

    expect(Client.plugins.registry.size).toBe(before);
  });
});

describe("version", () => {
  test("GIVEN the sources THEN the version is the placeholder the build replaces", () => {
    expect(version).toBe("[VI]{{inject}}[/VI]");
  });
});
