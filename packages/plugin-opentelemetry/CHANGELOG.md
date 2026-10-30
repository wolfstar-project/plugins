# @wolfstar/plugin-opentelemetry

## 0.2.0

### Minor Changes

- [#264](https://github.com/wolfstar-project/plugins/pull/264) [`37b50c7`](https://github.com/wolfstar-project/plugins/commit/37b50c7a181dfe877965f8a7b6e933b34cf5ac46) - Rename the interaction span attributes `wolfstar.interaction.kind`, `wolfstar.interaction.name` and `wolfstar.interaction.outcome` to `interaction.kind`, `interaction.name` and `interaction.outcome`. Update any dashboard or query that filters on the old names.

## 0.1.0

### Minor Changes

- [#262](https://github.com/wolfstar-project/plugins/pull/262) [`29293fc`](https://github.com/wolfstar-project/plugins/commit/29293fcd111eab81e44538e2d9446203020dcde4) - Add `@wolfstar/plugin-opentelemetry`, which traces a bot with OpenTelemetry.

  `@wolfstar/plugin-opentelemetry/preload`, loaded with `--import`, starts the SDK only on the main thread and only when an OTLP endpoint is set. It picks the exporter from `OTEL_EXPORTER_OTLP_PROTOCOL`, can add a Sentry exporter from `SENTRY_DSN` without leaking the headers of the first destination, redacts Discord tokens in `undici` spans, skips WebSocket handshakes and the transport of Sentry, and exports the last spans on `SIGTERM` without keeping the process alive.

  The `./plugin` (and the `./module`, under the `opentelemetry` key of `stars.config`) opens one span per command, handler and, on request, autocomplete, as the parent of the calls the command makes. `flushTraces()` exports the spans waiting in the batch from a shutdown path.
