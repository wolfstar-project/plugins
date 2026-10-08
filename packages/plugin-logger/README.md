<div align="center">

<h1><a href="https://wolfstar.rocks"><img src="https://cdn.wolfstar.rocks/logos/plugins/plugin-logger.svg" width="40" height="40" alt="WolfStar" align="top"></a> @wolfstar/plugin-logger</h1>

**Pluggable logging with swappable transports for `@wolfstar/http-framework`.**

[![version](https://npmx.dev/api/registry/badge/version/@wolfstar/plugin-logger)](https://npmx.dev/package/@wolfstar/plugin-logger)
[![downloads](https://npmx.dev/api/registry/badge/downloads/@wolfstar/plugin-logger)](https://npmx.dev/package/@wolfstar/plugin-logger)
[![license](https://img.shields.io/github/license/wolfstar-project/plugins?style=flat-square&color=informational)](https://github.com/wolfstar-project/plugins/blob/main/LICENSE)

</div>

## Description

A plugin for [`@wolfstar/http-framework`](https://www.npmjs.com/package/@wolfstar/http-framework)
that replaces the framework's built-in console logger with a pluggable one.

The framework ships a minimal `Logger` writing to `console`, and exposes it as `container.logger`.
This plugin swaps that implementation for a `Logger`, which fans every entry out to a list
of **transports** instead of a single hardcoded sink. It implements the same `ILogger` contract, so
nothing that already writes through `container.logger` needs to change.

It supersedes [`@wolfstar/logger`](https://www.npmjs.com/package/@wolfstar/logger), which is
deprecated.

## Installation

```bash
pnpm add @wolfstar/plugin-logger
```

Every logging backend is an **optional** peer dependency — install only the ones you use:

```bash
pnpm add consola   # for @wolfstar/plugin-logger/consola
pnpm add evlog     # for @wolfstar/plugin-logger/evlog
pnpm add winston   # for @wolfstar/plugin-logger/winston
```

`SentryTransport` takes the Sentry client you already use (`@sentry/node`, `@sentry/bun`, ...) through
its constructor, so it needs no extra dependency.

## Usage

### Stars module

On framework 6.1 and later, list the module in `modules` in `stars.config` (needs the optional
`@wolfstar/kit` peer):

```ts
// stars.config.ts
export default defineConfig({
  modules: [["@wolfstar/plugin-logger/module", { level: 20 }]],
});
```

The options are written into the built entry, so they must be JSON-serialisable (`level`, ...).
Transports are objects: set them through `ClientOptions.logger.transports`.

#### evlog through the module

The `evlog` option runs evlog's `initLogger` for you and adds an `EvlogTransport` to the logger. The
options are written inline:

```ts
// stars.config.ts
export default defineConfig({
  modules: [
    [
      "@wolfstar/plugin-logger/module",
      {
        level: 20,
        evlog: {
          env: { service: "bot" },
          sampling: { rates: { debug: 10 } },
          redact: true,
          pipeline: { batch: { size: 25 } },
          drain: "./src/evlog-drain.ts",
        },
      },
    ],
  ],
});
```

```ts
// src/evlog-drain.ts
import { createAxiomDrain } from "evlog/axiom";
import { defineEvlogDrain } from "@wolfstar/plugin-logger/evlog/plugin";

export default defineEvlogDrain(createAxiomDrain());
```

The options besides `drain` go to evlog's `initLogger` (`env`, `pretty`, `silent`, `minLevel`,
`sampling`, `redact`, ...), plus `tag` and `level` for the transport. They must be JSON, since they
are written into the built entry. The drain is a function, so it comes from a file of yours, which
Stars bundles with the bot and calls with those options. `evlog: true`, or options without `drain`,
need no file.

`pipeline` wraps the drain in evlog's drain pipeline (batching, retry, bounded buffer): `true` for its
defaults, or its options. The drain then receives events by batch, as the drain adapters do. A drain
that already has a `flush` is used as it is. Either way, closing the logger flushes it.

`drain` is a path (relative to the project root when it starts with `.`), a `file:` URL, a package
specifier, or `{ from, export }` for a named export. evlog prints to the console itself, so no
`ConsoleTransport` is added next to it; use `silent: true` when the drain should be the only output.

##### Wide events per interaction

The evlog plugin also follows the client's interaction lifecycle and drains **one wide event per
interaction** (evlog's [custom framework](https://www.evlog.dev/raw/extend/custom-framework.md)
model): created when a command, component or modal starts, filled with its outcome, and emitted when
it finishes. The event carries `method` (`COMMAND`, `AUTOCOMPLETE`, `COMPONENT` or `MODAL`), `path`
(the command or handler name), `requestId` (the interaction id), `outcome`, the `error` when it
failed, `durationMs`, and `guildId`, `channelId`, `userId` and `locale`. It goes through the same
drain, sampling, redaction and plugins as every other evlog event.

```ts
// Commands and handlers are on by default; add autocomplete:
const options = { evlog: { interactions: { autocomplete: true } } };
// Or turn the wide events off and keep only the `container.logger` entries:
const quiet = { evlog: { interactions: false } };
```

Autocomplete is off by default, since Discord sends a request for every keystroke.

From the code of a command, autocomplete or handler, `useInteractionLogger()` returns the interaction's
evlog request logger, to add fields to its wide event. It throws outside of an interaction, like
evlog's own `useLogger()`:

```ts
import { useInteractionLogger } from "@wolfstar/plugin-logger/evlog/plugin";

useInteractionLogger().set({ cart: { items: 3 } });
```

Without Stars, give the drain to the plugin directly, evlog first:

```ts
import evlogPlugin from "@wolfstar/plugin-logger/evlog/plugin";

plugins: [
  evlogPlugin({ env: { service: "bot" }, pipeline: true, drain: createAxiomDrain() }),
  loggerPlugin(),
];
```

Never combine the module (or the `@wolfstar/plugin-logger/plugin` factory below) with
`import "@wolfstar/plugin-logger/register"`: both paths install the same hooks, so combining them
installs them twice.

Without Stars, pass the `definePlugin` factory to `plugins` instead:

```ts
import loggerPlugin from "@wolfstar/plugin-logger/plugin";

const client = new Client({ plugins: [loggerPlugin({ level: LogLevel.Debug })] });
```

### `register` entrypoint (framework v3/v5/v6)

Import the side-effecting `register` entrypoint **before** you create your `Client`:

```ts
import "@wolfstar/plugin-logger/register";
import { Client, LogLevel } from "@wolfstar/http-framework";

const client = new Client({
  logger: { level: LogLevel.Debug },
});

container.logger.info("Ready");
```

Without any further configuration the logger writes to `console`, exactly like the framework's
built-in one.

## Transports

A transport is any object implementing `Transport`:

```ts
interface Transport {
  readonly level?: LogLevel;
  log(payload: LogPayload): void | Promise<void>;
  close?(): void | Promise<void>;
}
```

A `LogPayload` carries the raw `values` the caller passed, plus three fields derived from them once,
so every transport reads an entry the same way instead of guessing:

| Field     | Content                                                                                  |
| --------- | ---------------------------------------------------------------------------------------- |
| `message` | strings and other non-object values joined by spaces (the error's message as a fallback) |
| `error`   | the first `Error` among the values                                                       |
| `context` | the plain objects among the values, shallow-merged                                       |

```ts
logger.error("Failed to charge", { orderId: 7 }, error);
// message: "Failed to charge", context: { orderId: 7 }, error
```

`level` is optional and filters **on top of** the logger's own level, which is how a Sentry sink can
take only errors while the console keeps everything:

```ts
import "@wolfstar/plugin-logger/register";
import * as Sentry from "@sentry/node";
import { Client, LogLevel } from "@wolfstar/http-framework";
import { ConsoleTransport, SentryTransport } from "@wolfstar/plugin-logger";

const client = new Client({
  logger: {
    level: LogLevel.Debug,
    transports: [
      new ConsoleTransport(),
      new SentryTransport({ client: Sentry }), // defaults to LogLevel.Error
    ],
  },
});
```

A transport that throws — or returns a rejecting promise — never interrupts the caller: the error is
caught and reported to `console.error`.

### Built-in

| Transport          | Entrypoint | Peer dependency |
| ------------------ | ---------- | --------------- |
| `ConsoleTransport` | `.`        | none            |
| `SentryTransport`  | `.`        | none            |

`SentryTransport` lives in the core entrypoint but takes its Sentry client through the constructor,
so the package carries no runtime dependency on a Sentry SDK. The module namespace works directly,
and what Sentry receives depends on the entry's level:

| Option            | Sends                                             | Default          |
| ----------------- | ------------------------------------------------- | ---------------- |
| `level`           | an issue, with the message and context in `extra` | `LogLevel.Error` |
| `breadcrumbLevel` | a breadcrumb, for entries below `level`           | off              |
| `logLevel`        | a Sentry Log (needs `enableLogs: true`)           | off              |

```ts
import * as Sentry from "@sentry/node";

new SentryTransport({
  client: Sentry,
  level: LogLevel.Error, // issues
  breadcrumbLevel: LogLevel.Info, // context attached to the next issue
  logLevel: LogLevel.Info, // structured logs, searchable in Sentry
});
```

Breadcrumbs are off by default because Sentry's default console integration already records them for
`console.*`: turning them on next to a `ConsoleTransport` would duplicate them. Closing the logger
flushes the client (`flushTimeout`, 2s by default), so the last `fatal` before an exit is delivered.

### Backend adapters

Each adapter wraps a third-party logger as a transport, and lives behind its own subpath so the
dependency is only resolved when you import it.

```ts
import { consola } from "consola";
import { ConsolaTransport } from "@wolfstar/plugin-logger/consola";

new ConsolaTransport({ instance: consola });
```

```ts
import { initLogger, log } from "evlog";
import { createAxiomDrain } from "evlog/axiom";
import { createDrainPipeline } from "evlog/pipeline";
import { EvlogTransport } from "@wolfstar/plugin-logger/evlog";

// evlog owns the pipeline: drains, enrichers, sampling and redaction are configured here.
const drain = createDrainPipeline()(createAxiomDrain());
initLogger({ env: { service: "bot" }, drain });

new EvlogTransport({ instance: log, drain, tag: "bot" });
```

`EvlogTransport` hands each entry to evlog as a structured event (`message`, the context fields and
the `error` with its `cause` chain), which is the form that flows through evlog's drains. It does
not format or deliver anything itself, so everything evlog supports applies to the bot's logs. Pass
the `drain` pipeline so closing the logger flushes it. evlog also ships a Sentry drain, which makes
`SentryTransport` redundant when evlog is already your sink.

```ts
import { createLogger, transports } from "winston";
import { WinstonTransport } from "@wolfstar/plugin-logger/winston";

new WinstonTransport({
  instance: createLogger({ transports: [new transports.File({ filename: "bot.log" })] }),
});
```

`winston`'s default `npm` levels have no `fatal`, so a `fatal` entry is written as `error` with a
`fatal: true` field. Create the winston logger with `level: "silly"`: its own level (`info` by
default) filters on top of the plugin's, and would silently drop the lower ones.

## Migration

Coming from `@wolfstar/logger`:

```diff
-import { Logger, LogLevel } from '@wolfstar/logger';
+import '@wolfstar/plugin-logger/register';
+import { LogLevel, container } from '@wolfstar/http-framework';

-const logger = new Logger({ level: LogLevel.Debug });
-logger.info('Ready');
+const client = new Client({ logger: { level: LogLevel.Debug } });
+container.logger.info('Ready');
```

The `trace` / `debug` / `info` / `warn` / `error` / `fatal` methods behave the same, and `LogLevel`
keeps the same ordering — it is now imported from `@wolfstar/http-framework` rather than declared by
the logger package.
