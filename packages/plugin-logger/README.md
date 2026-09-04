# @wolfstar/plugin-logger

A plugin for [`@wolfstar/http-framework`](https://www.npmjs.com/package/@wolfstar/http-framework)
that replaces the framework's built-in console logger with a pluggable one.

The framework ships a minimal `Logger` writing to `console`, and exposes it as `container.logger`.
This plugin swaps that implementation for a `WolfStarLogger`, which fans every entry out to a list
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
pnpm add @sentry/node
```

## Usage

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
| `SentryTransport`  | `.`        | `@sentry/node`  |

`SentryTransport` lives in the core entrypoint but takes its Sentry client through the constructor,
so the package carries no runtime dependency on `@sentry/node`. The module namespace works directly:

```ts
import * as Sentry from "@sentry/node";

new SentryTransport({ client: Sentry, level: LogLevel.Warn });
```

### Backend adapters

Each adapter wraps a third-party logger as a transport, and lives behind its own subpath so the
dependency is only resolved when you import it.

```ts
import { consola } from "consola";
import { ConsolaTransport } from "@wolfstar/plugin-logger/consola";

new ConsolaTransport({ instance: consola });
```

```ts
import { log } from "evlog";
import { EvlogTransport } from "@wolfstar/plugin-logger/evlog";

new EvlogTransport({ instance: log, tag: "bot" });
```

```ts
import { createLogger, transports } from "winston";
import { WinstonTransport } from "@wolfstar/plugin-logger/winston";

new WinstonTransport({
  instance: createLogger({ transports: [new transports.File({ filename: "bot.log" })] }),
});
```

Note that `evlog` only has four levels and `winston`'s default `npm` levels have no `fatal`, so
`trace` collapses into `debug` and `fatal` into `error` on those backends.

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
