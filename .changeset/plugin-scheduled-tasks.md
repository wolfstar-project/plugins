---
"@wolfstar/plugin-scheduled-tasks": minor
---

New package: scheduled tasks for `@wolfstar/http-framework`, the counterpart of `@sapphire/plugin-scheduled-tasks`. Tasks are `ScheduledTask` pieces run by a BullMQ worker, created with `container.tasks.create()` or repeated on an `interval` or cron `pattern`. It is built on `definePlugin` and `defineModule`: list the package in `modules` in `stars.config`, or pass `scheduledTasks()` to `plugins`.
