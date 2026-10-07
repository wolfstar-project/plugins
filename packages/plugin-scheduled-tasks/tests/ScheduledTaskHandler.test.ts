import { DelayedError } from "bullmq";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ScheduledTaskEvents } from "../src/index.js";
import { ConnectionErrorMessage, resetBullmq } from "./fixtures/bullmq.js";
import { connection, createHandler, loadTask } from "./fixtures/setup.js";

vi.mock("bullmq", () => import("./fixtures/bullmq.js"));

// The task names are not registered in `ScheduledTasks` here: the type-level behaviour is covered by `tests/types`.
type AnyTask = never;

/** A BullMQ job as a worker hands it over, recording the delay it is given. */
function createJob() {
  return { name: "poststats", data: undefined, moveToDelayed: vi.fn(async () => {}) };
}

describe("ScheduledTaskHandler", () => {
  beforeEach(() => resetBullmq());

  describe("constructor", () => {
    test("GIVEN no queue name THEN it defaults to scheduled-tasks", () => {
      const { handler, queue, worker } = createHandler();

      expect(handler.queue).toBe("scheduled-tasks");
      expect(queue.name).toBe("scheduled-tasks");
      expect(worker.name).toBe("scheduled-tasks");
    });

    test("GIVEN a queue name THEN queue and worker use it", () => {
      const { handler, queue, worker } = createHandler("tasks");

      expect(handler.queue).toBe("tasks");
      expect(queue.name).toBe("tasks");
      expect(worker.name).toBe("tasks");
      expect(handler.client).toBe(queue);
    });

    test("GIVEN a new handler THEN its worker shares the connection and does not run yet", () => {
      const { worker } = createHandler();

      expect(worker.opts).toEqual({ connection, autorun: false });
      expect(worker.runs).toBe(0);
    });

    test("GIVEN queue options shared with workers THEN the worker gets them too", () => {
      const telemetry = {} as never;
      const { queue, worker } = createHandler(undefined, {
        prefix: "p",
        skipVersionCheck: true,
        telemetry,
        defaultJobOptions: { attempts: 3 },
      });

      expect(queue.opts).toMatchObject({ prefix: "p", defaultJobOptions: { attempts: 3 } });
      expect(worker.opts).toMatchObject({
        connection,
        prefix: "p",
        skipVersionCheck: true,
        telemetry,
      });
      // Queue-only options stay out of the worker's.
      expect(worker.opts).not.toHaveProperty("defaultJobOptions");
    });
  });

  describe("start", () => {
    test("GIVEN several calls THEN the worker runs once", () => {
      const { handler, worker } = createHandler();

      handler.start();
      handler.start();

      expect(worker.runs).toBe(1);
    });

    test("GIVEN a run that rejects THEN the error is emitted as a worker error", async () => {
      const { handler, worker, emitted } = createHandler();
      const error = new Error("boom");
      worker.runResult = Promise.reject(error);

      handler.start();
      await vi.waitFor(() => expect(emitted).toHaveLength(1));

      expect(emitted[0]).toEqual({
        event: ScheduledTaskEvents.ScheduledTaskStrategyWorkerError,
        args: [error],
      });
    });
  });

  describe("close", () => {
    test("GIVEN a handler THEN queue and worker are closed", async () => {
      const { handler, queue, worker } = createHandler();

      await handler.close();

      expect(queue.closed).toBe(true);
      expect(worker.closed).toBe(true);
    });
  });

  describe("create", () => {
    test("GIVEN no options THEN the job is added as it is", async () => {
      const { handler, queue } = createHandler();

      const job = await handler.create({ name: "mute" as AnyTask, payload: { id: "1" } as never });

      expect(queue.calls).toEqual([{ method: "add", args: ["mute", { id: "1" }, undefined] }]);
      expect(job.name).toBe("mute");
    });

    test("GIVEN a task name THEN the payload is undefined", async () => {
      const { handler, queue } = createHandler();

      await handler.create("mute" as AnyTask);

      expect(queue.calls).toEqual([{ method: "add", args: ["mute", undefined, undefined] }]);
    });

    test("GIVEN a number THEN it is the delay", async () => {
      const { handler, queue } = createHandler();

      await handler.create("mute" as AnyTask, 5000);

      expect(queue.calls).toEqual([{ method: "add", args: ["mute", undefined, { delay: 5000 }] }]);
    });

    test("GIVEN a delay with custom job options THEN both are passed", async () => {
      const { handler, queue } = createHandler();

      await handler.create("mute" as AnyTask, {
        repeated: false,
        delay: 100,
        customJobOptions: { removeOnComplete: true },
      });

      expect(queue.calls).toEqual([
        { method: "add", args: ["mute", undefined, { delay: 100, removeOnComplete: true }] },
      ]);
    });

    test("GIVEN a repeated interval THEN a job scheduler named after the task is upserted", async () => {
      const { handler, queue } = createHandler();

      await handler.create("sweep" as AnyTask, { repeated: true, interval: 60_000 });

      expect(queue.calls).toEqual([
        {
          method: "upsertJobScheduler",
          args: ["sweep", { every: 60_000 }, { name: "sweep", data: undefined, opts: undefined }],
        },
      ]);
    });

    test("GIVEN a repeated pattern THEN the scheduler gets the pattern and timezone", async () => {
      const { handler, queue } = createHandler();

      await handler.create(
        { name: "report" as AnyTask, payload: { day: 1 } as never },
        { repeated: true, pattern: "0 * * * *", timezone: "Europe/Rome" },
      );

      expect(queue.calls).toEqual([
        {
          method: "upsertJobScheduler",
          args: [
            "report",
            { pattern: "0 * * * *", tz: "Europe/Rome" },
            { name: "report", data: { day: 1 }, opts: undefined },
          ],
        },
      ]);
    });

    test("GIVEN a repeated task with single-job options THEN they are left out of the template", async () => {
      const { handler, queue } = createHandler();

      await handler.create("sweep" as AnyTask, {
        repeated: true,
        interval: 1000,
        customJobOptions: { jobId: "x", delay: 5, deduplication: { id: "d" }, attempts: 3 },
      });

      expect(queue.calls[0]!.args[2]).toEqual({
        name: "sweep",
        data: undefined,
        opts: { attempts: 3 },
      });
    });

    test("GIVEN the same repeated task twice THEN there is still one scheduler", async () => {
      const { handler, queue } = createHandler();

      await handler.create("sweep" as AnyTask, { repeated: true, interval: 1000 });
      await handler.create("sweep" as AnyTask, { repeated: true, interval: 2000 });

      expect([...queue.schedulers.values()]).toEqual([
        expect.objectContaining({ key: "sweep", repeat: { every: 2000 } }),
      ]);
    });
  });

  describe("createRepeated", () => {
    test("GIVEN no tasks THEN one scheduler per repeated piece is created", async () => {
      const { handler, queue, store } = createHandler();
      await loadTask(store, "interval", { interval: 1000, customJobOptions: { attempts: 2 } });
      await loadTask(store, "pattern", { pattern: "* * * * *", timezone: "Europe/Rome" });
      await loadTask(store, "utc", { pattern: "0 0 * * *" });
      await loadTask(store, "manual");

      await handler.createRepeated();

      expect(queue.calls.map((call) => call.args.slice(0, 2))).toEqual([
        ["interval", { every: 1000 }],
        ["pattern", { pattern: "* * * * *", tz: "Europe/Rome" }],
        ["utc", { pattern: "0 0 * * *", tz: "UTC" }],
      ]);
      expect(queue.calls[0]!.args[2]).toMatchObject({ opts: { attempts: 2 } });
    });

    test("GIVEN tasks THEN only those are created", async () => {
      const { handler, queue, store } = createHandler();
      await loadTask(store, "interval", { interval: 1000 });

      await handler.createRepeated([
        { name: "other" as AnyTask, options: { repeated: true, interval: 5 } },
      ]);

      expect(queue.calls.map((call) => call.args[0])).toEqual(["other"]);
    });
  });

  describe("get, list and delete", () => {
    test("GIVEN an existing job THEN get returns it and delete removes it", async () => {
      const { handler } = createHandler();
      const job = await handler.create("mute" as AnyTask);

      await expect(handler.get(job.id!)).resolves.toBe(job);
      await handler.delete(job.id!);
      await expect(handler.get(job.id!)).resolves.toBeUndefined();
    });

    test("GIVEN an unknown id THEN delete resolves", async () => {
      const { handler } = createHandler();

      await expect(handler.delete("nope")).resolves.toBeUndefined();
    });

    test("GIVEN list options THEN they are forwarded", async () => {
      const { handler, queue } = createHandler();
      const job = await handler.create("mute" as AnyTask);

      await expect(
        handler.list({ types: ["delayed"], start: 0, end: 10, asc: true }),
      ).resolves.toEqual([job]);
      expect(queue.calls.at(-1)).toEqual({ method: "getJobs", args: [["delayed"], 0, 10, true] });
    });

    test("GIVEN repeated tasks THEN listRepeated returns their schedulers", async () => {
      const { handler, queue } = createHandler();
      await handler.create("sweep" as AnyTask, { repeated: true, interval: 1000 });

      const schedulers = await handler.listRepeated({ start: 0, end: 5, asc: false });

      expect(schedulers).toEqual([expect.objectContaining({ key: "sweep" })]);
      expect(queue.calls.at(-1)).toEqual({ method: "getJobSchedulers", args: [0, 5, false] });
    });

    test("GIVEN a repeated task THEN deleteRepeated removes its scheduler", async () => {
      const { handler } = createHandler();
      await handler.create("sweep" as AnyTask, { repeated: true, interval: 1000 });

      await expect(handler.deleteRepeated("sweep")).resolves.toBe(true);
      await expect(handler.deleteRepeated("sweep")).resolves.toBe(false);
      await expect(handler.listRepeated()).resolves.toEqual([]);
    });
  });

  describe("run", () => {
    test("GIVEN a missing piece THEN it emits not found and returns undefined", async () => {
      const { handler, emitted } = createHandler();

      await expect(
        handler.run({ name: "ghost" as AnyTask, payload: 1 as never }),
      ).resolves.toBeUndefined();

      expect(emitted).toEqual([
        { event: ScheduledTaskEvents.ScheduledTaskNotFound, args: ["ghost", 1] },
      ]);
    });

    test("GIVEN a piece THEN it emits run, success and finished with the duration", async () => {
      const { handler, emitted, store } = createHandler();
      const run = vi.fn(() => "done");
      const piece = await loadTask(store, "mute", {}, run);

      const duration = await handler.run({
        name: "mute" as AnyTask,
        payload: { id: "1" } as never,
      });

      expect(run).toHaveBeenCalledWith({ id: "1" });
      expect(duration).toBeTypeOf("number");
      expect(emitted).toEqual([
        { event: ScheduledTaskEvents.ScheduledTaskRun, args: [piece, { id: "1" }] },
        {
          event: ScheduledTaskEvents.ScheduledTaskSuccess,
          args: [piece, { id: "1" }, "done", duration],
        },
        { event: ScheduledTaskEvents.ScheduledTaskFinished, args: [piece, duration, { id: "1" }] },
      ]);
    });

    test("GIVEN a piece that throws THEN it emits the error and rethrows", async () => {
      const { handler, emitted, store } = createHandler();
      const error = new Error("boom");
      const piece = await loadTask(store, "mute", {}, () => {
        throw error;
      });

      await expect(handler.run("mute" as AnyTask)).rejects.toBe(error);

      expect(emitted).toEqual([
        { event: ScheduledTaskEvents.ScheduledTaskRun, args: [piece, undefined] },
        { event: ScheduledTaskEvents.ScheduledTaskError, args: [error, piece, undefined] },
      ]);
    });

    test("GIVEN a job taken by the worker THEN the task runs with the job's data", async () => {
      const { worker, store } = createHandler();
      const run = vi.fn();
      await loadTask(store, "mute", {}, run);

      await worker.processor({ name: "mute", data: { id: "2" } });

      expect(run).toHaveBeenCalledWith({ id: "2" });
    });
  });

  describe("waitForReady", () => {
    afterEach(() => vi.useRealTimers());

    test("GIVEN no ready option THEN it resolves true", async () => {
      const { handler } = createHandler();

      await expect(handler.waitForReady()).resolves.toBe(true);
    });

    test.each([true, undefined])(
      "GIVEN a ready that resolves %s THEN it is ready",
      async (value) => {
        const { handler } = createHandler(undefined, {}, { ready: () => Promise.resolve(value) });

        await expect(handler.waitForReady()).resolves.toBe(true);
      },
    );

    test("GIVEN a ready that turns true THEN it is polled until then", async () => {
      vi.useFakeTimers();
      let ready = false;
      const { handler } = createHandler(undefined, {}, { ready: () => ready });

      const result = handler.waitForReady(5_000);
      await vi.advanceTimersByTimeAsync(1_000);
      ready = true;
      await vi.advanceTimersByTimeAsync(1_000);

      await expect(result).resolves.toBe(true);
    });

    test("GIVEN a ready that stays false THEN it resolves false at the timeout", async () => {
      vi.useFakeTimers();
      const ready = vi.fn(() => false);
      const { handler } = createHandler(undefined, {}, { ready, readyTimeout: 1_000 });

      const result = handler.waitForReady();
      await vi.advanceTimersByTimeAsync(1_000);

      await expect(result).resolves.toBe(false);
      expect(ready.mock.calls.length).toBeGreaterThan(1);
    });

    test("GIVEN a promise that does not settle THEN it resolves false at the timeout", async () => {
      vi.useFakeTimers();
      const { handler } = createHandler(undefined, {}, { ready: () => new Promise(() => {}) });

      const result = handler.waitForReady(500);
      await vi.advanceTimersByTimeAsync(500);

      await expect(result).resolves.toBe(false);
    });

    test("GIVEN a ready that throws THEN it rejects", async () => {
      const error = new Error("boom");
      const ready = () => {
        throw error;
      };
      const { handler } = createHandler(undefined, {}, { ready });

      await expect(handler.waitForReady()).rejects.toBe(error);
    });
  });

  describe("run when the app is not ready", () => {
    afterEach(() => vi.useRealTimers());

    test("GIVEN a task that does not wait THEN it runs without asking ready", async () => {
      const ready = vi.fn(() => false);
      const { handler, store } = createHandler(undefined, {}, { ready });
      const run = vi.fn();
      await loadTask(store, "poststats", {}, run);

      await handler.run("poststats" as AnyTask);

      expect(run).toHaveBeenCalledOnce();
      expect(ready).not.toHaveBeenCalled();
    });

    test("GIVEN a task that waits and no ready option THEN it runs", async () => {
      const { handler, store } = createHandler();
      const run = vi.fn();
      await loadTask(store, "poststats", { waitForReady: true }, run);

      await handler.run("poststats" as AnyTask);

      expect(run).toHaveBeenCalledOnce();
    });

    test("GIVEN a task that waits and an app that is ready THEN it runs", async () => {
      const { handler, store } = createHandler(undefined, {}, { ready: () => true });
      const run = vi.fn();
      await loadTask(store, "poststats", { waitForReady: true }, run);

      await handler.run("poststats" as AnyTask);

      expect(run).toHaveBeenCalledOnce();
    });

    test("GIVEN an app that becomes ready within the timeout THEN the task runs", async () => {
      vi.useFakeTimers();
      let ready = false;
      const { handler, store } = createHandler(undefined, {}, { ready: () => ready });
      const run = vi.fn();
      await loadTask(store, "poststats", { waitForReady: true }, run);
      const job = createJob();

      const result = handler.run("poststats" as AnyTask, { job: job as never, token: "t" });
      await vi.advanceTimersByTimeAsync(1_000);
      ready = true;
      await vi.advanceTimersByTimeAsync(1_000);
      await result;

      expect(run).toHaveBeenCalledOnce();
      expect(job.moveToDelayed).not.toHaveBeenCalled();
    });

    test("GIVEN an app that is not ready in time THEN the job is delayed without an error", async () => {
      vi.useFakeTimers({ now: 1_000_000 });
      const { handler, store, emitted } = createHandler(
        undefined,
        {},
        { ready: () => false, readyTimeout: 1_000, readyDelay: 20_000 },
      );
      const run = vi.fn();
      const piece = await loadTask(store, "poststats", { waitForReady: true }, run);
      const job = createJob();

      const result = handler.run("poststats" as AnyTask, { job: job as never, token: "t" });
      const rejection = expect(result).rejects.toBeInstanceOf(DelayedError);
      await vi.advanceTimersByTimeAsync(1_000);
      await rejection;

      expect(run).not.toHaveBeenCalled();
      expect(job.moveToDelayed).toHaveBeenCalledExactlyOnceWith(1_000_000 + 1_000 + 20_000, "t");
      expect(emitted).toEqual([
        { event: ScheduledTaskEvents.ScheduledTaskNotReady, args: [piece, undefined] },
      ]);
    });

    test("GIVEN a job taken by the worker THEN its job and token are used to delay it", async () => {
      vi.useFakeTimers();
      const { worker, store } = createHandler(
        undefined,
        {},
        { ready: () => false, readyTimeout: 0, readyDelay: 5 },
      );
      await loadTask(store, "poststats", { waitForReady: true });
      const job = createJob();

      await expect(worker.processor(job, "lock")).rejects.toBeInstanceOf(DelayedError);

      expect(job.moveToDelayed).toHaveBeenCalledExactlyOnceWith(Date.now() + 5, "lock");
    });

    test("GIVEN no job THEN it emits not ready and returns undefined", async () => {
      const { handler, store, emitted } = createHandler(
        undefined,
        {},
        { ready: () => false, readyTimeout: 0 },
      );
      const run = vi.fn();
      const piece = await loadTask(store, "poststats", { waitForReady: true }, run);

      await expect(handler.run("poststats" as AnyTask)).resolves.toBeUndefined();

      expect(run).not.toHaveBeenCalled();
      expect(emitted).toEqual([
        { event: ScheduledTaskEvents.ScheduledTaskNotReady, args: [piece, undefined] },
      ]);
    });

    test("GIVEN a ready that throws THEN it emits the task error and rethrows", async () => {
      const error = new Error("boom");
      const ready = () => {
        throw error;
      };
      const { handler, store, emitted } = createHandler(undefined, {}, { ready });
      const run = vi.fn();
      const piece = await loadTask(store, "poststats", { waitForReady: true }, run);

      await expect(handler.run("poststats" as AnyTask)).rejects.toBe(error);

      expect(run).not.toHaveBeenCalled();
      expect(emitted).toEqual([
        { event: ScheduledTaskEvents.ScheduledTaskError, args: [error, piece, undefined] },
      ]);
    });
  });

  describe("errors", () => {
    test.each([
      ["queue", "boom", ScheduledTaskEvents.ScheduledTaskStrategyClientError],
      ["queue", ConnectionErrorMessage, ScheduledTaskEvents.ScheduledTaskStrategyConnectError],
      ["worker", "boom", ScheduledTaskEvents.ScheduledTaskStrategyWorkerError],
      ["worker", ConnectionErrorMessage, ScheduledTaskEvents.ScheduledTaskStrategyConnectError],
    ] as const)("GIVEN a %s error %j THEN it emits %s", (source, message, event) => {
      const setup = createHandler();
      const error = new Error(message);

      setup[source].emit("error", error);

      expect(setup.emitted).toEqual([{ event, args: [error] }]);
    });
  });
});
