export * from "./lib/ScheduledTaskHandler.js";
export * from "./lib/structures/ScheduledTask.js";
export * from "./lib/structures/ScheduledTaskStore.js";
export * from "./lib/types/ScheduledTaskEvents.js";
export type * from "./lib/types/ScheduledTaskTypes.js";

export { loadListeners } from "./listeners/_load.js";
export { default as scheduledTasks } from "./plugin.js";
export { scheduledTasksModule, scheduledTasksModule as default } from "./module.js";

/**
 * The `@wolfstar/plugin-scheduled-tasks` version, replaced with the `package.json` version at build time by
 * `@redstardev/unplugin-version-injector`.
 */
export const version: string = "[VI]{{inject}}[/VI]";
