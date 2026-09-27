# @wolfstar/plugin-logger

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
