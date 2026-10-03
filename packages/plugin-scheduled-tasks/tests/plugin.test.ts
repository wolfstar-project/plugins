import { Client, container, PluginHookError } from "@wolfstar/http-framework";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  ScheduledTaskEvents,
  ScheduledTaskHandler,
  scheduledTasks,
  ScheduledTaskStore,
  type ScheduledTasksPluginOptions,
} from "../src/index.js";
import pluginDefault from "../src/plugin.js";
import { Queue, resetBullmq, Worker } from "./fixtures/bullmq.js";
import { connection, loadTask } from "./fixtures/setup.js";

vi.mock("bullmq", () => import("./fixtures/bullmq.js"));

const ListenerNames = [
  "PluginScheduledTaskError",
  "PluginScheduledTaskNotFound",
  "PluginScheduledTaskStrategyClientError",
  "PluginScheduledTaskStrategyConnectError",
  "PluginScheduledTaskStrategyWorkerError",
];

function createClient(
  pluginOptions?: ScheduledTasksPluginOptions,
  clientOptions: Partial<Client["options"]> = {},
) {
  return new Client({
    discordPublicKey: "a".repeat(64),
    discordToken: "token",
    plugins: [scheduledTasks(pluginOptions)],
    ...clientOptions,
  });
}

/**
 * The built-in listeners the plugin asked the store registry to load while `run` was creating a client.
 */
async function loadedListeners(run: () => unknown): Promise<string[]> {
  const loadPiece = vi.spyOn(container.stores, "loadPiece");
  run();
  // The hook does not await `loadListeners()`.
  await new Promise((resolve) => setImmediate(resolve));

  const names = loadPiece.mock.calls.map(([entry]) => entry.name);
  loadPiece.mockRestore();
  return names;
}

describe("scheduledTasks", () => {
  beforeEach(() => resetBullmq());

  test("GIVEN the plugin subpath THEN its default export is the factory", () => {
    expect(pluginDefault).toBe(scheduledTasks);
    expect(scheduledTasks().name).toBe("@wolfstar/plugin-scheduled-tasks");
  });

  test("GIVEN plugin options THEN the handler and the store are installed", () => {
    createClient({ queue: "tasks", bull: { connection } });

    expect(container.tasks).toBeInstanceOf(ScheduledTaskHandler);
    expect(container.tasks.queue).toBe("tasks");
    expect(container.tasks.options).toEqual({ connection });
    expect(container.stores.get("scheduled-tasks")).toBeInstanceOf(ScheduledTaskStore);
  });

  test("GIVEN only ClientOptions.tasks THEN it configures the handler", () => {
    createClient(undefined, { tasks: { bull: { connection } } });

    expect(container.tasks.queue).toBe("scheduled-tasks");
    expect(container.tasks.options).toEqual({ connection });
  });

  test("GIVEN both THEN ClientOptions.tasks is merged over the plugin options", () => {
    const override = { host: "redis", port: 1 };
    createClient(
      { queue: "plugin", bull: { connection, prefix: "p" } },
      { tasks: { queue: "client", bull: { connection: override } } },
    );

    expect(container.tasks.queue).toBe("client");
    expect(container.tasks.options).toEqual({ connection: override, prefix: "p" });
    // The worker has to listen under the same key prefix the queue writes to.
    expect(Queue.instances.at(-1)!.opts).toMatchObject({ prefix: "p" });
    expect(Worker.instances.at(-1)!.opts).toMatchObject({ connection: override, prefix: "p" });
  });

  test("GIVEN no connection THEN the client fails with the plugin's name", () => {
    expect(() => createClient()).toThrow(PluginHookError);
    expect(() => createClient()).toThrow(/@wolfstar\/plugin-scheduled-tasks.*bull\.connection/s);
  });

  test("GIVEN the defaults THEN the error listeners are loaded", async () => {
    const names = await loadedListeners(() => createClient({ bull: { connection } }));

    expect(names).toEqual(ListenerNames);
  });

  test.each([
    ["the plugin option", { bull: { connection }, loadErrorListeners: false }, {}],
    ["the client option", { bull: { connection } }, { loadScheduledTaskErrorListeners: false }],
  ])("GIVEN %s set to false THEN the error listeners are not loaded", async (_, plugin, client) => {
    const names = await loadedListeners(() => createClient(plugin, client));

    expect(names).toEqual([]);
  });

  test("GIVEN listeners that fail to load THEN the error goes to the logger", async () => {
    const error = new Error("boom");
    const loadPiece = vi.spyOn(container.stores, "loadPiece").mockRejectedValue(error);

    createClient({ bull: { connection } });
    const logged = vi.spyOn(container.logger, "error").mockImplementation(() => {});
    await new Promise((resolve) => setImmediate(resolve));

    expect(logged).toHaveBeenCalledWith(
      "[plugin-scheduled-tasks] Failed to load listeners:",
      error,
    );
    loadPiece.mockRestore();
    logged.mockRestore();
  });

  test("GIVEN postListen THEN the worker starts and the repeated tasks are created", async () => {
    const client = createClient({ bull: { connection } });
    const plugin = scheduledTasks();
    await loadTask(container.stores.get("scheduled-tasks"), "sweep", { interval: 1000 });
    const worker = Worker.instances.at(-1)!;
    const queue = Queue.instances.at(-1)!;
    expect(worker.runs).toBe(0);

    await plugin.postListen(client, client.options);

    expect(worker.runs).toBe(1);
    await vi.waitFor(() => expect(queue.schedulers.has("sweep")).toBe(true));
  });

  test("GIVEN repeated tasks that cannot be created THEN the error is emitted on the client", async () => {
    const client = createClient({ bull: { connection } });
    const error = new Error("boom");
    const errors: unknown[] = [];
    client.on(ScheduledTaskEvents.ScheduledTaskStrategyClientError, (value) => errors.push(value));
    vi.spyOn(container.tasks, "createRepeated").mockRejectedValue(error);

    await scheduledTasks().postListen(client, client.options);

    await vi.waitFor(() => expect(errors).toEqual([error]));
  });
});
