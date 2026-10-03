// The side-effecting entrypoint every `@wolfstar/plugin-*` package ships: the Stars CLI build (`@wolfstar/cli`)
// imports `@wolfstar/plugin-scheduled-tasks/register` for each such dependency of a project.
//
// It is intentionally a no-op: the plugin is registered by listing the package in `modules` in `stars.config`, or by
// passing `scheduledTasks()` to `plugins` / `Client.use`. Registering it here too would run its hooks twice for a
// project that lists the module, and start two workers on the same queue.

// oxlint-disable-next-line unicorn/require-module-specifiers -- `export {}` is what keeps an empty entrypoint a module.
export {};
