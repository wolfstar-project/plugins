// Starts the OpenTelemetry SDK before the bot, loaded with `--import`: an instrumentation only patches a library that
// is imported after it, so it has to run before the entry of the bot imports anything.
//
// It does nothing unless an OTLP endpoint is set (`OTEL_EXPORTER_OTLP_ENDPOINT` or
// `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`), and then reads the protocol, the headers and the resource from the
// environment as the SDK does.
//
// A worker thread inherits `--import` too: each would start an SDK, take seconds to answer its first message and hold
// hundreds of megabytes, so the SDK only starts on the main thread.
import { isMainThread } from "node:worker_threads";
import { hasOtlpEndpoint, startTracing } from "./lib/tracing.js";

if (isMainThread && hasOtlpEndpoint()) {
  // The bot is ES modules: without the loader hook of `import-in-the-middle`, the libraries it imports stay unpatched
  // and only the spans of the `http` server appear.
  const { register } = await import("node:module");
  register("@opentelemetry/instrumentation/hook.mjs", import.meta.url);

  await startTracing();
}
