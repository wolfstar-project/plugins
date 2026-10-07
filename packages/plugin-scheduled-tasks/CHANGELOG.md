# @wolfstar/plugin-scheduled-tasks

## 0.2.0

### Minor Changes

- [#228](https://github.com/wolfstar-project/plugins/pull/228) [`1ba434b`](https://github.com/wolfstar-project/plugins/commit/1ba434b613be41023bfe986684bc39fdcfc71751) - Add a readiness gate for tasks that need the app to be up. Give the plugin a `ready` callback (with optional `readyTimeout` and `readyDelay`) and set `waitForReady: true` on the tasks that need it: when a job is taken before the app is ready it waits, and if the timeout passes it is moved back to `delayed` instead of failed, so it costs no attempt and emits no `scheduledTaskError`. The new `scheduledTaskNotReady` event (`ScheduledTaskEvents.ScheduledTaskNotReady`) reports it, and `ScheduledTaskHandler#waitForReady()` lets a task wait by hand. `ScheduledTaskHandler#run` takes an optional second argument with the BullMQ job and token.

## 0.1.0

### Minor Changes

- [#177](https://github.com/wolfstar-project/plugins/pull/177) [`ba8fe8e`](https://github.com/wolfstar-project/plugins/commit/ba8fe8e3f1fe405815c43b4977b1961ddece4751) - New package: scheduled tasks for `@wolfstar/http-framework`, the counterpart of `@sapphire/plugin-scheduled-tasks`. Tasks are `ScheduledTask` pieces run by a BullMQ worker, created with `container.tasks.create()` or repeated on an `interval` or cron `pattern`. It is built on `definePlugin` and `defineModule`: list the package in `modules` in `stars.config`, or pass `scheduledTasks()` to `plugins`.
