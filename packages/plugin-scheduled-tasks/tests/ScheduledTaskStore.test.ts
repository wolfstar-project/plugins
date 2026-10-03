import { describe, expect, test } from "vitest";
import { ScheduledTaskStore } from "../src/index.js";
import { loadTask } from "./fixtures/setup.js";

describe("ScheduledTaskStore", () => {
  test("GIVEN a new store THEN it is named scheduled-tasks", () => {
    expect(new ScheduledTaskStore().name).toBe("scheduled-tasks");
  });

  test("GIVEN pieces THEN only the ones with an interval or a pattern are repeated", async () => {
    const store = new ScheduledTaskStore();
    const interval = await loadTask(store, "interval", { interval: 1000 });
    const pattern = await loadTask(store, "pattern", { pattern: "* * * * *" });
    const manual = await loadTask(store, "manual");

    expect(store.repeatedTasks).toEqual([interval, pattern]);
    expect(manual).toMatchObject({ interval: null, pattern: null, timezone: "UTC" });
  });

  test("GIVEN a deleted piece THEN it is no longer repeated", async () => {
    const store = new ScheduledTaskStore();
    await loadTask(store, "interval", { interval: 1000 });
    const pattern = await loadTask(store, "pattern", { pattern: "* * * * *" });

    store.delete("interval");

    expect(store.repeatedTasks).toEqual([pattern]);
  });

  test("GIVEN a cleared store THEN nothing is repeated", async () => {
    const store = new ScheduledTaskStore();
    await loadTask(store, "interval", { interval: 1000 });

    store.clear();

    expect(store.repeatedTasks).toEqual([]);
    expect(store.size).toBe(0);
  });
});
