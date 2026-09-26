// The side-effecting entrypoint every `@wolfstar/plugin-*` package ships: the Stars CLI build (`@wolfstar/cli`)
// imports `@wolfstar/plugin-sharder/register` for each such dependency of a project.
//
// It is intentionally a no-op: `@wolfstar/plugin-sharder` runs outside of the framework's `Client` (the manager
// spawns the processes that construct it), so it has no `Plugin` hook to register.

// oxlint-disable-next-line unicorn/require-module-specifiers -- `export {}` is what keeps an empty entrypoint a module.
export {};
