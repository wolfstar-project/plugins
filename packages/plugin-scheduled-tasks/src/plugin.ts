import { container, definePlugin } from "@wolfstar/http-framework";
import { ScheduledTaskHandler } from "./lib/ScheduledTaskHandler.js";
import { ScheduledTaskStore } from "./lib/structures/ScheduledTaskStore.js";
import { ScheduledTaskEvents } from "./lib/types/ScheduledTaskEvents.js";
import type {
  ScheduledTaskHandlerOptions,
  ScheduledTasksPluginOptions,
} from "./lib/types/ScheduledTaskTypes.js";
import { loadListeners } from "./listeners/_load.js";

/**
 * The scheduled tasks plugin: installs a {@link ScheduledTaskHandler} on `container.tasks`, registers the
 * `scheduled-tasks` store, and starts the worker once the client is listening.
 *
 * @param pluginOptions The handler options. `ClientOptions.tasks` is merged over them, so they can be given here, in
 * the client options, or split between the two.
 *
 * @example
 * ```ts
 * import { scheduledTasks } from '@wolfstar/plugin-scheduled-tasks';
 *
 * const client = new Client({
 *   plugins: [scheduledTasks({ bull: { connection: { host: 'localhost', port: 6379 } } })]
 * });
 * ```
 */
export default definePlugin((pluginOptions: ScheduledTasksPluginOptions = {}) => ({
  name: "@wolfstar/plugin-scheduled-tasks",

  preGenericsInitialization(_client, options) {
    const queue = options.tasks?.queue ?? pluginOptions.queue;
    const bull = { ...pluginOptions.bull, ...options.tasks?.bull };

    if (!bull.connection) {
      throw new TypeError(
        "No Redis connection was given: set `bull.connection` in the plugin's options or in `ClientOptions.tasks`",
      );
    }

    container.tasks = new ScheduledTaskHandler({
      queue,
      bull: { ...bull, connection: bull.connection },
    });
  },

  postInitialization(_client, options) {
    container.stores.register(new ScheduledTaskStore());

    const loadErrorListeners =
      options.loadScheduledTaskErrorListeners ?? pluginOptions.loadErrorListeners ?? true;
    if (loadErrorListeners) {
      loadListeners().catch((error: unknown) =>
        container.logger.error("[plugin-scheduled-tasks] Failed to load listeners:", error),
      );
    }
  },

  // Runs once every piece is loaded: the worker can only resolve a job's task from here on.
  postListen(client) {
    container.tasks.start();

    // Not awaited: BullMQ holds commands until Redis is reachable, which would hold `listen()` for as long as it is not.
    container.tasks
      .createRepeated()
      .catch((error: unknown) =>
        client.emit(ScheduledTaskEvents.ScheduledTaskStrategyClientError, error),
      );
  },
}));

declare module "@sapphire/pieces" {
  interface Container {
    /**
     * The {@link ScheduledTaskHandler}, installed by the plugin's `preGenericsInitialization` hook.
     */
    tasks: ScheduledTaskHandler;
  }

  interface StoreRegistryEntries {
    "scheduled-tasks": ScheduledTaskStore;
  }
}

declare module "@wolfstar/http-framework" {
  interface ClientOptions {
    /**
     * The scheduled task handler options, merged over the ones given to the plugin.
     */
    tasks?: Partial<ScheduledTaskHandlerOptions>;
    /**
     * If the pre-included scheduled task error listeners should be loaded.
     * @default true
     */
    loadScheduledTaskErrorListeners?: boolean;
  }
}
