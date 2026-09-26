// The side-effecting entrypoint every `@wolfstar/plugin-*` package ships: the Stars CLI build (`@wolfstar/cli`)
// imports `@wolfstar/plugin-gateway/register` for each such dependency of a project.
//
// It is intentionally a no-op, and registers no `Plugin` hook: the gateway is opted into by constructing a
// `GatewayClient`, which connects its shards through `GatewayClient#start` or `GatewayClient#connect`. A hook would
// run for every `Client` of the process instead, and the framework runs `postInitialization` hooks from the base
// constructor, before `GatewayClient` has set up its gateway and cache.

// oxlint-disable-next-line unicorn/require-module-specifiers -- `export {}` is what keeps an empty entrypoint a module.
export {};
