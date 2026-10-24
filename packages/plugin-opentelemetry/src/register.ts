// The side-effecting entrypoint every `@wolfstar/plugin-*` package ships: the Stars CLI build (`@wolfstar/cli`)
// imports `@wolfstar/plugin-opentelemetry/register` for each such dependency of a project.
//
// It is intentionally a no-op: the plugin is registered by listing the package in `modules` in `stars.config`, or by
// passing the `./plugin` factory to `plugins`, and the SDK is started by the `./preload` entrypoint, which has to run
// before the entry of the bot and so cannot be imported from it.

// oxlint-disable-next-line unicorn/require-module-specifiers -- `export {}` is what keeps an empty entrypoint a module.
export {};
