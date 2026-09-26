// The side-effecting entrypoint every `@wolfstar/plugin-*` package ships: the Stars CLI build (`@wolfstar/cli`)
// imports `@wolfstar/plugin-cache/register` for each such dependency of a project.
//
// It is intentionally a no-op: `@wolfstar/plugin-cache` is a storage library, not an `@wolfstar/http-framework`
// plugin, so it has no `Plugin` hook to register. The cache is passed explicitly to `GatewayClient` through its
// `cache` option instead.

// oxlint-disable-next-line unicorn/require-module-specifiers -- `export {}` is what keeps an empty entrypoint a module.
export {};
