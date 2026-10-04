# @wolfstar/plugin-scheduled-tasks

## 0.1.0

### Minor Changes

- [#177](https://github.com/wolfstar-project/plugins/pull/177) [`ba8fe8e`](https://github.com/wolfstar-project/plugins/commit/ba8fe8e3f1fe405815c43b4977b1961ddece4751) - New package: scheduled tasks for `@wolfstar/http-framework`, the counterpart of `@sapphire/plugin-scheduled-tasks`. Tasks are `ScheduledTask` pieces run by a BullMQ worker, created with `container.tasks.create()` or repeated on an `interval` or cron `pattern`. It is built on `definePlugin` and `defineModule`: list the package in `modules` in `stars.config`, or pass `scheduledTasks()` to `plugins`.
