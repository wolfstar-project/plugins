import { container } from "@wolfstar/http-framework";
import { EventEmitter } from "node:events";
import { ScheduledTask, ScheduledTaskHandler, ScheduledTaskStore } from "../../src/index.js";
import { Queue, Worker } from "./bullmq.js";

export const connection = { host: "localhost", port: 6379 };

export interface Emitted {
  event: string;
  args: unknown[];
}

/**
 * Installs a stand-in client that records what is emitted on it, a fresh `scheduled-tasks` store, and a handler.
 */
export function createHandler(queue?: string) {
  const emitted: Emitted[] = [];
  const client = new EventEmitter();
  const emit = client.emit.bind(client);
  client.emit = (event: string, ...args: unknown[]) => {
    emitted.push({ event, args });
    return emit(event, ...args);
  };
  // The framework's listeners for an unhandled `error` event are not installed on the stand-in.
  client.on("error", () => {});
  container.client = client as never;

  const store = new ScheduledTaskStore();
  container.stores.register(store);

  const handler = new ScheduledTaskHandler({ queue, bull: { connection } });
  container.tasks = handler;

  return {
    handler,
    store,
    emitted,
    queue: Queue.instances.at(-1)!,
    worker: Worker.instances.at(-1)!,
  };
}

const loadedStores = new WeakSet<ScheduledTaskStore>();

/**
 * Loads a task piece into the store and returns it.
 */
export async function loadTask(
  store: ScheduledTaskStore,
  name: string,
  options: ScheduledTask.Options = {},
  run: (payload: unknown) => unknown = () => undefined,
): Promise<ScheduledTask> {
  class Task extends ScheduledTask {
    public constructor(context: ScheduledTask.LoaderContext) {
      super(context, options);
    }

    public override run(payload: unknown) {
      return run(payload);
    }
  }

  // `loadPiece` only queues pieces until the store was loaded once, which is normally `client.load()`'s job. After
  // that it inserts them right away, so a piece returned here stays the instance the store holds.
  if (!loadedStores.has(store)) {
    await store.loadAll();
    loadedStores.add(store);
  }

  await store.loadPiece({ name, piece: Task });
  return store.get(name)!;
}
