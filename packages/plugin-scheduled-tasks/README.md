<div align="center">

<img src="https://cdn.wolfstar.rocks/wolfstar-assets/wolfstar.png" alt="WolfStar" width="100" />

# @wolfstar/plugin-scheduled-tasks

**Schedule one-off and repeated tasks, backed by BullMQ.**

[![version](https://npmx.dev/api/registry/badge/version/@wolfstar/plugin-scheduled-tasks)](https://npmx.dev/package/@wolfstar/plugin-scheduled-tasks)
[![downloads](https://npmx.dev/api/registry/badge/downloads/@wolfstar/plugin-scheduled-tasks)](https://npmx.dev/package/@wolfstar/plugin-scheduled-tasks)
[![license](https://img.shields.io/github/license/wolfstar-project/plugins?style=flat-square&color=informational)](https://github.com/wolfstar-project/plugins/blob/main/LICENSE)

</div>

## Description

A plugin for [`@wolfstar/http-framework`](https://www.npmjs.com/package/@wolfstar/http-framework)
that runs tasks later or on a schedule: unmuting a member in an hour, sending a report every
morning. It is the counterpart of
[`@sapphire/plugin-scheduled-tasks`](https://www.npmjs.com/package/@sapphire/plugin-scheduled-tasks).
Tasks are pieces, and their jobs are stored in Redis by [BullMQ](https://docs.bullmq.io/), so they
survive a restart and are shared by every process of the bot.

It requires `@wolfstar/http-framework` 6.1.0 or later and a Redis server.

## Installation

```bash
pnpm add @wolfstar/plugin-scheduled-tasks @wolfstar/kit
```

## Usage

### Registering the plugin

With the `stars` CLI, list the package in `modules`:

```ts
// stars.config.ts
import { defineConfig } from "@wolfstar/http-framework/config";

export default defineConfig({
  modules: [
    [
      "@wolfstar/plugin-scheduled-tasks",
      { queue: "tasks", bull: { connection: { host: "localhost", port: 6379 } } },
    ],
  ],
});
```

Options written in `stars.config` end up in the built entry, so they have to be JSON-serialisable.

Without the CLI, or to pass an `ioredis` instance, give the plugin to the client:

```ts
import { Client } from "@wolfstar/http-framework";
import { scheduledTasks } from "@wolfstar/plugin-scheduled-tasks";

const client = new Client({
  plugins: [scheduledTasks({ bull: { connection: { host: "localhost", port: 6379 } } })],
});
```

`ClientOptions.tasks` is merged over the plugin's options, so the connection can also be set there:

```ts
const client = new Client({
  plugins: [scheduledTasks()],
  tasks: {
    bull: { connection: new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null }) },
  },
});
```

Use one of the two ways, not both. `@wolfstar/plugin-scheduled-tasks/register` exists for the CLI and
does nothing.

| Option               | Default             | Description                                                                        |
| -------------------- | ------------------- | ---------------------------------------------------------------------------------- |
| `bull`               |                     | BullMQ's `QueueOptions`. `bull.connection` is required and is also the worker's.   |
| `queue`              | `"scheduled-tasks"` | The name of the BullMQ queue.                                                      |
| `loadErrorListeners` | `true`              | Load the listeners that log task and connection errors through `container.logger`. |

### Writing a task

A task is a piece of the `scheduled-tasks` store, in the `scheduled-tasks` directory:

```ts
// src/scheduled-tasks/unmute.ts
import { ScheduledTask } from "@wolfstar/plugin-scheduled-tasks";

export class UnmuteTask extends ScheduledTask<"unmute"> {
  public override async run(payload: { guildId: string; userId: string }) {
    // ...
  }
}

declare module "@wolfstar/plugin-scheduled-tasks" {
  interface ScheduledTasks {
    unmute: { guildId: string; userId: string };
  }
}
```

The `ScheduledTasks` interface types the payload everywhere: `never` for a task without one, a union
with `undefined` for an optional one.

### Scheduling a task

```ts
import { container } from "@wolfstar/http-framework";

// In one hour
await container.tasks.create({ name: "unmute", payload: { guildId, userId } }, 3_600_000);
```

`create` returns the BullMQ job. `container.tasks.get(id)`, `list()` and `delete(id)` read and
remove jobs, and `container.tasks.client` is the BullMQ `Queue` itself.

### Repeated tasks

A task with an `interval` (milliseconds) or a cron `pattern` is scheduled when the client starts
listening:

```ts
import { ScheduledTask } from "@wolfstar/plugin-scheduled-tasks";

export class ReportTask extends ScheduledTask<"report"> {
  public constructor(context: ScheduledTask.LoaderContext) {
    super(context, { pattern: "0 8 * * *", timezone: "Europe/Rome" });
  }

  public override run() {
    // every day at 08:00
  }
}

declare module "@wolfstar/plugin-scheduled-tasks" {
  interface ScheduledTasks {
    report: never;
  }
}
```

A repeated task is a BullMQ [job scheduler](https://docs.bullmq.io/guide/job-schedulers) named after
the task. Changing the `pattern` or `interval` in the code replaces its schedule on the next start.
Deleting the piece does not delete the scheduler from Redis: remove it with
`container.tasks.deleteRepeated("report")`, and list the existing ones with
`container.tasks.listRepeated()`.

### Events

The client emits `scheduledTaskRun`, `scheduledTaskSuccess`, `scheduledTaskError`,
`scheduledTaskFinished` and `scheduledTaskNotFound` around every run, and
`scheduledTaskStrategyConnectError`, `scheduledTaskStrategyClientError` and
`scheduledTaskStrategyWorkerError` for Redis and BullMQ failures. Their names are in
`ScheduledTaskEvents`.

A task that throws fails its job, which BullMQ retries according to the job's `attempts` (set them
with `customJobOptions`).

### Shutting down

```ts
await container.tasks.close();
```

closes the queue and waits for the worker to finish the task it is running.

## Differences from `@sapphire/plugin-scheduled-tasks`

- It runs on BullMQ 6, where repeated tasks are job schedulers: `listRepeated()` returns
  `JobSchedulerJson[]`, and `deleteRepeated(name)` is added.
- The worker starts once the pieces are loaded rather than when the handler is constructed, so a job
  is never taken before its task exists.
- `ClientOptions.tasks` is optional, since the options can be given to the plugin.
