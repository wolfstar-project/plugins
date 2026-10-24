<div align="center">

<h1>@wolfstar/plugin-opentelemetry</h1>

**Trace a `@wolfstar/http-framework` bot with OpenTelemetry.**

[![version](https://npmx.dev/api/registry/badge/version/@wolfstar/plugin-opentelemetry)](https://npmx.dev/package/@wolfstar/plugin-opentelemetry)
[![downloads](https://npmx.dev/api/registry/badge/downloads/@wolfstar/plugin-opentelemetry)](https://npmx.dev/package/@wolfstar/plugin-opentelemetry)
[![license](https://img.shields.io/github/license/wolfstar-project/plugins?style=flat-square&color=informational)](https://github.com/wolfstar-project/plugins/blob/main/LICENSE)

</div>

## Description

Two parts, used together or apart:

- **A preload**, `@wolfstar/plugin-opentelemetry/preload`, loaded with `--import`. It starts the OpenTelemetry SDK with the
  automatic instrumentations before the bot imports anything, and takes care of what goes wrong when a Discord bot does that
  (see [What the preload handles](#what-the-preload-handles)).
- **A plugin**, `@wolfstar/plugin-opentelemetry/plugin`, that opens one span per interaction, so the `pg`, `ioredis` or
  `undici` spans of a command have the command as their parent instead of floating in the trace of the HTTP request.

## Installation

```bash
pnpm add @wolfstar/plugin-opentelemetry @opentelemetry/api
```

Needs Node 22.15 or later, which the OpenTelemetry SDK requires.

`@opentelemetry/api` is a peer dependency because there has to be one copy of it in the process. The SDK, the
instrumentations and the OTLP exporters are dependencies of this package.

## Usage

### The preload

Add it to the command that starts the bot:

```bash
node --import @wolfstar/plugin-opentelemetry/preload dist/main.mjs
```

It does nothing unless an OTLP endpoint is set, so the same command runs locally with no tracing. Everything else is
the standard OpenTelemetry environment:

| Variable                                                             | Effect                                                                                                                                      |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` / `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | Turns the tracing on, and says where the spans go.                                                                                          |
| `OTEL_EXPORTER_OTLP_PROTOCOL` / `OTEL_EXPORTER_OTLP_TRACES_PROTOCOL` | `http/protobuf` (the default), `http/json` or `grpc`.                                                                                       |
| `OTEL_EXPORTER_OTLP_HEADERS` / `OTEL_EXPORTER_OTLP_TRACES_HEADERS`   | The headers of that destination, its token included.                                                                                        |
| `OTEL_TRACES_EXPORTER`                                               | Only `none` is honoured: it turns this destination off. This package exports OTLP only, so `console`, `zipkin` and the rest still get OTLP. |
| `SENTRY_DSN`                                                         | Also sends the spans to the OTLP endpoint of that Sentry project, with the key of the DSN only.                                             |
| `OTEL_SERVICE_NAME`, `OTEL_RESOURCE_ATTRIBUTES`, ...                 | Read by the SDK as usual.                                                                                                                   |

#### What the preload handles

Each of these was found on a real deploy:

- **ES modules.** The bot is ESM, so the SDK has to register the `import-in-the-middle` loader hook before anything is
  imported. A preload is the only place that runs early enough.
- **Worker threads.** A worker thread inherits `--import`, and would start an SDK of its own (seconds and hundreds of
  megabytes each). The SDK only starts on the main thread.
- **`SIGTERM`.** The SDK is shut down on `SIGTERM` to export the last spans, without keeping the process alive: a listener
  of `SIGTERM` stops the process from ending on it, so the preload raises the signal again when no other listener is left.
  The broker consumer of a `BOT_MODE=worker` process does the same, and the two do not keep each other alive.
- **Tokens in URLs.** The URL of a webhook or of an interaction callback holds a token that lets anybody post there. It is
  replaced with `REDACTED` in the spans of `undici` before they start.
- **The gateway's WebSocket.** `@discordjs/ws` opens the gateway with an `http` request carrying `Upgrade: websocket`, and
  everything the bot does with the dispatches it receives afterwards runs in that request's context: one trace that
  never closes. WebSocket handshakes are not traced.
- **Sentry's transport.** The requests of `@sentry/node` carry the key of the DSN in the query. They are not traced.
- **Two destinations.** An OTLP exporter adds the `OTEL_EXPORTER_OTLP_*` headers to the ones it is given, so a second
  exporter would send the token of the first destination to Sentry. The variables are hidden while the Sentry exporter is
  created.

### The plugin

With the Stars CLI (framework 6.1 and later, needs the optional `@wolfstar/kit` peer, 0.2 or later), list the module and
write its options under the `opentelemetry` key:

```ts
// stars.config.ts
import type {} from "@wolfstar/plugin-opentelemetry/module"; // types the `opentelemetry` key in `defineConfig`

export default defineConfig({
  modules: ["@wolfstar/plugin-opentelemetry/module"],
  opentelemetry: { interactions: { autocomplete: true } },
});
```

Or pass the factory to the client:

```ts
import { Client } from "@wolfstar/http-framework";
import openTelemetryPlugin from "@wolfstar/plugin-opentelemetry/plugin";

const client = new Client({
  plugins: [openTelemetryPlugin({ interactions: { autocomplete: true } })],
});
```

Without an SDK running, `@opentelemetry/api` hands out no-op spans and the plugin costs nothing.

#### Options

| Option                      | Default | Spans for                                          |
| --------------------------- | ------- | -------------------------------------------------- |
| `interactions.commands`     | `true`  | Slash, user and message commands.                  |
| `interactions.autocomplete` | `false` | Autocomplete requests (Discord sends one per key). |
| `interactions.handlers`     | `true`  | Message components and modals.                     |

`interactions: false` turns them all off, `true` takes the defaults.

#### The spans

A span is named `<kind> <name>` (`command ping`, `component confirm`) and carries:

| Attribute                      | Value                                              |
| ------------------------------ | -------------------------------------------------- |
| `wolfstar.interaction.kind`    | `command`, `autocomplete`, `component` or `modal`. |
| `wolfstar.interaction.name`    | The name of the command or of the handler.         |
| `wolfstar.interaction.outcome` | `success` or `error`.                              |
| `discord.interaction.id`       | The id of the interaction.                         |
| `discord.guild.id`             | The guild, when the interaction came from one.     |
| `discord.channel.id`           | The channel.                                       |

A failing run records the exception and sets the span status to `ERROR`.

The framework's events do not wrap the run of a command, so the span is made the active one with
`context.attach` from the
`*Run` event, and the previous context is restored on `*Finish`. That needs a context manager that implements `attach`,
as the `AsyncLocalStorageContextManager` of the SDK does (`@opentelemetry/api` 1.10 and later). With one that does not, the
spans are still created, but what a command starts is not attached to them.

### `flushTraces()`

Exports the spans waiting in the batch. Call it from a shutdown path before the process exits; it never rejects, and does
nothing when no SDK is running.

```ts
import { flushTraces } from "@wolfstar/plugin-opentelemetry";

process.once("SIGINT", async () => {
  await flushTraces();
  process.exit(0);
});
```

### Sentry

`@sentry/node` 11 does not register a tracer provider by default (`enableOpenTelemetrySetup` defaults to `false`), which is
what lets this package own the SDK. Its `openTelemetryIntegration()` puts the errors Sentry captures on the active trace; add it to
`Sentry.init` to link an error to the span of the command that raised it.

## License

[Apache-2.0](https://github.com/wolfstar-project/plugins/blob/main/LICENSE)
