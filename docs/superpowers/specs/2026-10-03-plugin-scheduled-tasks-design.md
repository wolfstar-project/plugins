# `@wolfstar/plugin-scheduled-tasks` design

Date: 2026-10-03

## Goal

Add `@wolfstar/plugin-scheduled-tasks`, the counterpart of
[`@sapphire/plugin-scheduled-tasks`](https://github.com/sapphiredev/plugins/tree/main/packages/scheduled-tasks) 10.0.4:
scheduled and repeated tasks backed by BullMQ on Redis, written as pieces.

It is the first package of this repo built on the plugin system introduced by `@wolfstar/http-framework` 6.1.0
(`definePlugin`) and `@wolfstar/kit` 0.1.0 (`defineModule`), instead of the legacy `Plugin` class and
`Client.plugins.registerXHook`.

## Decisions taken with the maintainer

1. The workspace moves to framework 6.1 in a **separate PR first**; the package lands in a second PR on top.
2. Activation is **module + plugin factory**; `./register` is a no-op.
3. The backend is **BullMQ 6 with Job Schedulers**, not the repeatable-jobs API upstream uses on BullMQ 5.

## PR 1: workspace on framework 6.1

`tests/http-framework-peer-range.test.ts` requires every plugin's peer range to accept the framework version the
workspace installs and all ranges to accept the same majors, so the new package cannot install 6.1 while the others
stay on 5.1.

- Every package declaring the peer: `devDependencies["@wolfstar/http-framework"]` to `^6.1.0`, peer range extended
  with `|| ^6.0.0`, one patch changeset per package.
- 6.0.0 moved the utility decorators to `@wolfstar/decorators`. No package in this repo imports them today (checked
  by grep on `ApplyOptions`, `RequiresGuildContext`, `createClassDecorator`); if the build or tests show otherwise,
  add `@wolfstar/decorators` as a devDependency where needed.
- Existing plugins stay on the legacy API. From 6.1 it emits one `DeprecationWarning`
  (`HTTP_FRAMEWORK_LEGACY_PLUGIN`) per plugin; porting them to `definePlugin` is out of scope.
- Done when `pnpm lint`, `pnpm build`, `pnpm typecheck` and `pnpm test` pass.

## PR 2: the package

### Layout

```
packages/plugin-scheduled-tasks/
  src/
    index.ts                      named exports, augmentations, default export = the module
    module.ts                     defineModule(...)
    plugin.ts                     default export = definePlugin((options) => ({ ... }))
    register.ts                   no-op (export {})
    lib/ScheduledTaskHandler.ts
    lib/structures/ScheduledTask.ts
    lib/structures/ScheduledTaskStore.ts
    lib/types/ScheduledTaskEvents.ts
    lib/types/ScheduledTaskTypes.ts
    listeners/_load.ts
    listeners/PluginScheduledTaskError.ts
    listeners/PluginScheduledTaskNotFound.ts
    listeners/PluginScheduledTaskStrategyClientError.ts
    listeners/PluginScheduledTaskStrategyConnectError.ts
    listeners/PluginScheduledTaskStrategyWorkerError.ts
  tests/
  tsconfig.json, tsconfig.consumption.json, tsdown.config.ts, package.json, README.md
```

### Entry points

| Subpath      | Content                                                                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.`          | default export: the module. Named: `scheduledTasks`, `ScheduledTaskHandler`, `ScheduledTask`, `ScheduledTaskStore`, `ScheduledTaskEvents`, `loadListeners`, and the types.      |
| `./plugin`   | default export: the plugin factory (the same function as `scheduledTasks`). This is the `from` the module passes to `ctx.addPlugin`.                                            |
| `./register` | no-op. The `stars` CLI still imports `<pkg>/register` for every `@wolfstar/plugin-*` dependency; registering there as well would run the hooks twice when the module is listed. |

All three are built by tsdown (`entry`) and validated by attw (`attwEntrypoints`). `sideEffects` is `false`.

### Usage

```ts
// stars.config.ts
export default defineConfig({
  modules: [
    [
      "@wolfstar/plugin-scheduled-tasks",
      { queue: "tasks", bull: { connection: { host: "localhost", port: 6379 } } },
    ],
  ],
});
```

```ts
// without the CLI
import { scheduledTasks } from "@wolfstar/plugin-scheduled-tasks";

new Client({ plugins: [scheduledTasks({ bull: { connection } })] });
```

### Module (`module.ts`)

```ts
export default defineModule<ScheduledTasksModuleOptions>({
  meta: { name: "@wolfstar/plugin-scheduled-tasks", compatibility: { framework: ">=6.1.0" } },
  setup(options, ctx) {
    ctx.addPlugin({ from: "@wolfstar/plugin-scheduled-tasks/plugin", options });
    ctx.addImports("@wolfstar/plugin-scheduled-tasks");
  },
});
```

`ScheduledTasksModuleOptions` is `Partial<ScheduledTaskHandlerOptions> & { loadErrorListeners?: boolean }`. Module
options are written into the built entry, so they must be JSON-serialisable: `bull.connection` is a plain
`ConnectionOptions` object there. An `ioredis` instance can only be passed through the factory or `ClientOptions.tasks`.

### Plugin (`plugin.ts`)

Name: `@wolfstar/plugin-scheduled-tasks`. No `enforce`, no `apply`.

| Hook                        | Behaviour                                                                                                                                                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `preGenericsInitialization` | Resolves options: factory options as the base, `ClientOptions.tasks` shallow-merged over them (`bull` merged one level deep). Throws a `TypeError` naming the missing key when `bull.connection` is absent. Sets `container.tasks`. |
| `postInitialization`        | `container.stores.register(new ScheduledTaskStore())`. Loads the listeners unless `loadErrorListeners` (factory) or `ClientOptions.loadScheduledTaskErrorListeners` is `false`.                                                     |
| `postListen`                | `container.tasks.start()`, then `createRepeated()` without awaiting it: BullMQ holds commands until Redis is reachable, which would hold `listen()`. A rejection is emitted as `scheduledTaskStrategyClientError`.                  |

Sapphire's `postLogin` maps to `postListen`: there is no login here, and `postListen` runs once every piece is loaded.

### `ScheduledTaskHandler`

Constructed with `ScheduledTaskHandlerOptions` (`{ queue?: string; bull: QueueOptions }`, default queue
`"scheduled-tasks"`). The constructor creates the `Queue` and a `Worker` with `autorun: false`, and wires the error
events exactly like upstream: `isNotConnectionError(error)` routes to `ScheduledTaskStrategyClientError` or
`ScheduledTaskStrategyWorkerError`, anything else to `ScheduledTaskStrategyConnectError`. Events are emitted on
`container.client`.

| Member                   | Behaviour                                                                                                                                                                                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `options`, `queue`       | As upstream.                                                                                                                                                                                                                                             |
| `client`                 | The BullMQ `Queue`.                                                                                                                                                                                                                                      |
| `start()`                | Calls `worker.run()` once (idempotent); its promise only settles when the worker closes, so it is not awaited and a rejection is emitted as a worker error.                                                                                              |
| `close()`                | Closes queue and worker.                                                                                                                                                                                                                                 |
| `create(task, options?)` | No options: `queue.add(name, payload)`. Number or `repeated: false`: `queue.add` with `delay` and `customJobOptions`. `repeated: true`: `queue.upsertJobScheduler(name, { every } \| { pattern, tz }, { name, data: payload, opts: customJobOptions })`. |
| `createRepeated(tasks?)` | Without arguments, one `create` per piece of `store.repeatedTasks`; otherwise the given tasks. Sequential, as upstream.                                                                                                                                  |
| `delete(id)`             | Removes the job with that id, if any.                                                                                                                                                                                                                    |
| `deleteRepeated(name)`   | `queue.removeJobScheduler(name)`. Not in upstream: a scheduler is not a job, so `delete` cannot remove it.                                                                                                                                               |
| `list(options)`          | `queue.getJobs(types, start, end, asc)`.                                                                                                                                                                                                                 |
| `listRepeated(options)`  | `queue.getJobSchedulers(start, end, asc)`; returns `JobSchedulerJson[]`.                                                                                                                                                                                 |
| `get(id)`                | `queue.getJob(id)`, `undefined` when absent.                                                                                                                                                                                                             |
| `run(task)`              | As upstream: `NotFound` and `undefined` when the piece is missing; otherwise `Run`, then `Success` with the duration, or `Error` and rethrow; then `Finished`. Duration measured with `@sapphire/stopwatch`, as upstream.                                |

### Deliberate differences from upstream

- **The worker starts in `postListen`**, after the pieces are loaded. Upstream starts it in the constructor, so a job
  consumed before the store loads ends in `scheduledTaskNotFound` and is lost. This is the construct/start split
  `plugin-broker` already uses.
- **Job Schedulers keyed by task name.** Changing a piece's `pattern` or `interval` updates its scheduler instead of
  leaving the previous repeatable job behind in Redis.
- **`deleteRepeated`** is added and **`listRepeated`** returns `JobSchedulerJson[]`.
- Schedulers left in Redis by pieces removed from the code are **not pruned**: they cannot be told apart from the
  ones created by hand with `create(..., { repeated: true })`. They surface as `scheduledTaskNotFound`.
- The `version` export is injected at build time by `@redstardev/unplugin-version-injector`, like `plugin-api`.

### Pieces, store, events, listeners, types

Ported as they are:

- `ScheduledTask<Task, Options>`: a `Piece` of the `"scheduled-tasks"` store with `interval`, `pattern`, `timezone`
  (default `"UTC"`), `customJobOptions`, and abstract `run(payload)`. Namespace types `Options`, `LoaderContext`,
  `JSON`, `LocationJSON` (the deprecated `Context` alias is dropped).
- `ScheduledTaskStore`: tracks `repeatedTasks` across `set`, `delete`, `clear`.
- `ScheduledTaskEvents`: the eight event names, with their argument tuples augmented on the framework's
  `ClientEvents`.
- Five listeners logging through `container.logger`, loaded by `loadListeners()` with `container.stores.loadPiece`.
- `ScheduledTasks` and the derived key/payload/resolvable/job types, augmented by consumers through
  `declare module "@wolfstar/plugin-scheduled-tasks"`.

Augmentations in `index.ts`: `Container.tasks`, `StoreRegistryEntries["scheduled-tasks"]` (on `@sapphire/pieces`),
and on `@wolfstar/http-framework` `ClientOptions.tasks?: Partial<ScheduledTaskHandlerOptions>` and
`ClientOptions.loadScheduledTaskErrorListeners?: boolean`. `tasks` is optional here, unlike upstream, because the
options may come from the factory.

### Dependencies

- `dependencies`: `bullmq@^6`, `@sapphire/stopwatch`.
- `peerDependencies`: `@wolfstar/http-framework@^6.1.0`, `@wolfstar/kit@^0.1.0` (kit's README prescribes a peer for
  modules).
- `devDependencies`: both peers and `@sapphire/pieces`.
- `engines.node`: `>=20.0.0`.

A consumer who only calls `scheduledTasks()` still installs kit, because `.` imports it for the default export.
Accepted for now; a `./module` subpath is the fallback if it becomes a problem.

The peer-range test compares accepted majors up to the installed one, so `^6.1.0` here next to
`^3 || ^5 || ^6` elsewhere fails it. The test gets a per-package minimum: a package may accept fewer majors when its
own range starts above them. This change belongs to PR 2.

### Tests

No real Redis: `bullmq` is replaced with `vi.mock` by fake `Queue` and `Worker` classes built on `EventEmitter` that
record their calls.

- `ScheduledTaskHandler.test.ts`: `create` in its three branches; `createRepeated` from the store and from
  arguments; `run` event order on success, on a throwing piece and on a missing piece; `list`, `listRepeated`, `get`,
  `delete`, `deleteRepeated`; error routing for queue and worker; `start` idempotence.
- `ScheduledTaskStore.test.ts`: `repeatedTasks` across `set`, `delete`, `clear`.
- `plugin.test.ts`: a real `Client` with `plugins: [scheduledTasks(...)]`: `container.tasks` set, store registered,
  listeners loaded or skipped, `ClientOptions.tasks` overriding factory options, the missing-connection error, and
  `postListen` starting the worker and creating the repeated tasks.
- `module.test.ts`: `setup` calls `addPlugin` with `from` and the options, and `addImports`.
- `register.test.ts`: importing `./register` adds nothing to `Client.plugins.registry`.
- `tests/types/`: consumption test for the `ScheduledTasks` augmentation (payload required, optional, absent),
  checked through `tsconfig.consumption.json`, appended to the root `typecheck` script.

### Repository chores

- `.github/labels.yml` and `.github/labeler.yml`: `packages:plugin-scheduled-tasks`.
- `knip.json`: workspace entry.
- Package `README.md`.
- A minor changeset for the initial release.
- `CLAUDE.md`: package list, and `plugin-scheduled-tasks` in the list of packages with a consumption test.

## Out of scope

- Porting the existing plugins to `definePlugin` / `defineModule`.
- A backend other than BullMQ.
- Pruning orphaned schedulers.
- An option to disable the worker in a process.
