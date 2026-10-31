# @wolfstar/plugin-scheduled-tasks

## 0.3.1

### Patch Changes

- [#240](https://github.com/wolfstar-project/plugins/pull/240) [`16d62bd`](https://github.com/wolfstar-project/plugins/commit/16d62bdd9a7850d4451082ab6193f8300b924c0b) - fix(deps): update all non-major dependencies Thanks [@renovate](https://github.com/apps/renovate)!

## 0.3.0

### Minor Changes

- [#259](https://github.com/wolfstar-project/plugins/pull/259) [`e9c503d`](https://github.com/wolfstar-project/plugins/commit/e9c503da60e60a732bc916250c0d875919a9714c) - Every module sets `meta.configKey`, so an application writes a module's options under its own top-level key of `stars.config` (`api`, `broker`, `cache`, `gateway`, `i18n`, `logger`, `scheduledTasks`, `sharder`, `subcommandsAdvanced`) instead of the `[specifier, options]` tuple of `modules`. The tuple still works and is merged over the key. The key is typed in `defineConfig` once the module is imported in `stars.config.ts`; `cache`, `gateway`, `sharder` and `subcommandsAdvanced` take no options yet and only reserve their name.

  The `@wolfstar/kit` peer range moves from `^0.1.0` to `^0.2.0`, the first version that reads `configKey`, and `@wolfstar/schema` (`^0.9.0`) is a new optional peer that carries the `StarsConfig` type the keys extend. A project on `@wolfstar/kit` 0.1 has to update it.

## 0.2.0

### Minor Changes

- [#228](https://github.com/wolfstar-project/plugins/pull/228) [`1ba434b`](https://github.com/wolfstar-project/plugins/commit/1ba434b613be41023bfe986684bc39fdcfc71751) - Add a readiness gate for tasks that need the app to be up. Give the plugin a `ready` callback (with optional `readyTimeout` and `readyDelay`) and set `waitForReady: true` on the tasks that need it: when a job is taken before the app is ready it waits, and if the timeout passes it is moved back to `delayed` instead of failed, so it costs no attempt and emits no `scheduledTaskError`. The new `scheduledTaskNotReady` event (`ScheduledTaskEvents.ScheduledTaskNotReady`) reports it, and `ScheduledTaskHandler#waitForReady()` lets a task wait by hand. `ScheduledTaskHandler#run` takes an optional second argument with the BullMQ job and token.

## 0.1.0

### Minor Changes

- [#177](https://github.com/wolfstar-project/plugins/pull/177) [`ba8fe8e`](https://github.com/wolfstar-project/plugins/commit/ba8fe8e3f1fe405815c43b4977b1961ddece4751) - New package: scheduled tasks for `@wolfstar/http-framework`, the counterpart of `@sapphire/plugin-scheduled-tasks`. Tasks are `ScheduledTask` pieces run by a BullMQ worker, created with `container.tasks.create()` or repeated on an `interval` or cron `pattern`. It is built on `definePlugin` and `defineModule`: list the package in `modules` in `stars.config`, or pass `scheduledTasks()` to `plugins`.
