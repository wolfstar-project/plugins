import { defineModule } from "@wolfstar/kit";
import type { ScheduledTasksPluginOptions } from "./lib/types/ScheduledTaskTypes.js";

/**
 * The Stars module: listing the package in `modules` in `stars.config` registers the runtime plugin with the options
 * written under its `scheduledTasks` key.
 *
 * @remarks
 * The `[specifier, options]` tuple of `modules` still works: its options are merged over the `scheduledTasks` key, so
 * they win.
 *
 * The options are written into the built entry, so they have to be JSON-serialisable: `bull.connection` is a plain
 * connection object here. To pass an `ioredis` instance or the `ready` function, use `ClientOptions.tasks` or `scheduledTasks()`.
 *
 * @example
 * ```ts
 * // stars.config.ts
 * export default defineConfig({
 *   modules: ['@wolfstar/plugin-scheduled-tasks'],
 *   scheduledTasks: { bull: { connection: { host: 'localhost', port: 6379 } } }
 * });
 * ```
 */
export const scheduledTasksModule = defineModule<ScheduledTasksPluginOptions>({
  meta: {
    name: "@wolfstar/plugin-scheduled-tasks",
    configKey: "scheduledTasks",
    compatibility: { framework: ">=6.1.0" },
  },
  setup(options, ctx) {
    ctx.addPlugin({ from: "@wolfstar/plugin-scheduled-tasks/plugin", options });
    ctx.addImports("@wolfstar/plugin-scheduled-tasks");
  },
});

declare module "@wolfstar/schema" {
  interface StarsConfig {
    scheduledTasks?: ScheduledTasksPluginOptions;
  }
}
