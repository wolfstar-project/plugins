# @wolfstar/plugin-opentelemetry

## 0.1.0

### Minor Changes

- [#262](https://github.com/wolfstar-project/plugins/pull/262) [`29293fc`](https://github.com/wolfstar-project/plugins/commit/29293fcd111eab81e44538e2d9446203020dcde4) - Add `@wolfstar/plugin-opentelemetry`, which traces a bot with OpenTelemetry.

  `@wolfstar/plugin-opentelemetry/preload`, loaded with `--import`, starts the SDK only on the main thread and only when an OTLP endpoint is set. It picks the exporter from `OTEL_EXPORTER_OTLP_PROTOCOL`, can add a Sentry exporter from `SENTRY_DSN` without leaking the headers of the first destination, redacts Discord tokens in `undici` spans, skips WebSocket handshakes and the transport of Sentry, and exports the last spans on `SIGTERM` without keeping the process alive.

  The `./plugin` (and the `./module`, under the `opentelemetry` key of `stars.config`) opens one span per command, handler and, on request, autocomplete, as the parent of the calls the command makes. `flushTraces()` exports the spans waiting in the batch from a shutdown path.
