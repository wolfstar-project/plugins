# @wolfstar/plugin-logger

## 0.4.0

### Minor Changes

- [#232](https://github.com/wolfstar-project/plugins/pull/232) [`0dc1020`](https://github.com/wolfstar-project/plugins/commit/0dc1020dfa9eb71eb6fc971987437aa3aa7ac14a) - feat(plugin-logger)!: derive a shared `message`, `error` and `context` on every payload, and rework the Sentry, evlog and winston transports on top of them. `LogPayload` gains the three fields (see `createLogPayload`, for custom transports and tests). `SentryTransport` keeps the message and context next to an exception, can record breadcrumbs (`breadcrumbLevel`) and send Sentry Logs (`logLevel`), and flushes the client on close; the `@sentry/node` peer dependency is dropped. `EvlogTransport` now writes structured events through evlog's pipeline instead of flattened strings, maps all six levels, and flushes the `drain` on close; the `evlog` peer is raised to `^2.30.0`. `WinstonTransport` serialises errors, flags `fatal` entries, and no longer hangs when closed twice. The Stars module gains an `evlog` option that runs `initLogger` and adds the transport: `evlog: true`, or the options written inline (`env`, `sampling`, `redact`, `pipeline`, ...) with `drain` pointing to a file default-exporting `defineEvlogDrain(...)` (new `@wolfstar/plugin-logger/evlog/plugin` entry, whose default export is the plugin factory taking the drain directly outside Stars). The evlog plugin also emits one evlog wide event per interaction (command, component, modal, optionally autocomplete) with its outcome, error, duration and who/where, controlled by the `interactions` option, and `useInteractionLogger()` adds fields to it from the code of a command.

## 0.3.0

### Minor Changes

- [#187](https://github.com/wolfstar-project/plugins/pull/187) [`a548c51`](https://github.com/wolfstar-project/plugins/commit/a548c51642b1a119df6fe91e79fd5dd377bcca51) - Add `@wolfstar/plugin-logger/module` and `@wolfstar/plugin-logger/plugin`: list the module in `modules` in `stars.config`, or pass the `definePlugin` factory to `plugins`. Both need framework 6.1 (and `@wolfstar/kit` for the module); `./register` is unchanged and still supports framework v3, v5 and v6.

## 0.2.2

### Patch Changes

- [#176](https://github.com/wolfstar-project/plugins/pull/176) [`c989f83`](https://github.com/wolfstar-project/plugins/commit/c989f8396af21be2038ffbb513e38eb1189ccbde) - Accept `@wolfstar/http-framework` v6 in the peer range (`|| ^6.0.0`).

## 0.2.1

### Patch Changes

- [#125](https://github.com/wolfstar-project/plugins/pull/125) [`27f8d59`](https://github.com/wolfstar-project/plugins/commit/27f8d59bec0d0bd193be4ab27f86e893e19afa32) - fix: accept `@wolfstar/http-framework` v5 as a peer dependency (`^3.4.0 || ^5.0.0`), so v5 projects no longer install the plugin with an unmet peer ([#121](https://github.com/wolfstar-project/plugins/issues/121))

## 0.2.0

### Minor Changes

- [#70](https://github.com/wolfstar-project/plugins/pull/70) [`9fad109`](https://github.com/wolfstar-project/plugins/commit/9fad109a5a84f609e5c3f9cc7d87e2d86874fbf9) - Add `@wolfstar/plugin-logger`, a pluggable logger for `@wolfstar/http-framework` that replaces the
  deprecated `@wolfstar/logger`.

  It installs a `Logger` as `container.logger` through the `preGenericsInitialization` hook,
  implementing the framework's `ILogger` contract so migrating is a drop-in change. Instead of being
  hardcoded to `console`, it fans every entry out to a list of transports, each able to filter by its
  own level on top of the logger's.

  The package ships `ConsoleTransport` (the zero-dependency default) and `SentryTransport` in its core
  entrypoint, plus `ConsolaTransport`, `EvlogTransport`, and `WinstonTransport` behind the
  `./consola`, `./evlog`, and `./winston` subpaths. Every backend is an optional peer dependency whose
  instance is injected through the transport constructor, so the core stays free of runtime
  dependencies and consumers only install what they actually use.
