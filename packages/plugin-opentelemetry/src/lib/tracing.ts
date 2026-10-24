import type { NodeSDK } from "@opentelemetry/sdk-node";
import { createEnvironmentSpanExporter, createSentrySpanExporter } from "./exporters.js";
import { getInstrumentationConfig } from "./instrumentation.js";

/**
 * Whether the environment names an OTLP endpoint, which is what turns the tracing on: without one, the SDK would
 * export to `localhost`.
 *
 * @param env The environment. Defaults to `process.env`.
 */
export function hasOtlpEndpoint(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.OTEL_EXPORTER_OTLP_ENDPOINT || env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT);
}

/**
 * Starts the OpenTelemetry SDK with the automatic instrumentations, the W3C trace context propagator and an exporter
 * for each place the spans go to: the one the `OTEL_EXPORTER_OTLP_*` environment configures, and Sentry, when
 * `SENTRY_DSN` is set.
 *
 * @remarks
 * Call it before anything the instrumentations patch is imported, which is what the `./preload` entrypoint does.
 *
 * @returns The SDK, which is shut down on `SIGTERM` to export the last spans, without keeping the process from ending.
 */
export async function startTracing(): Promise<NodeSDK> {
  const [
    { NodeSDK },
    { getNodeAutoInstrumentations, getResourceDetectors },
    { BatchSpanProcessor },
  ] = await Promise.all([
    import("@opentelemetry/sdk-node"),
    import("@opentelemetry/auto-instrumentations-node"),
    import("@opentelemetry/sdk-trace"),
  ]);

  const dsn = process.env.SENTRY_DSN;

  // The SDK only builds the exporter of the environment when it is given no span processor, so it is built here.
  const spanProcessors = [
    new BatchSpanProcessor({ exporter: await createEnvironmentSpanExporter() }),
  ];
  const sentry = await createSentrySpanExporter(dsn);
  if (sentry) spanProcessors.push(new BatchSpanProcessor({ exporter: sentry }));

  const sdk = new NodeSDK({
    instrumentations: getNodeAutoInstrumentations(getInstrumentationConfig(dsn)),
    resourceDetectors: getResourceDetectors(),
    spanProcessors,
  });
  sdk.start();

  const shutdown = () => sdk.shutdown().catch(() => undefined);
  process.once("beforeExit", shutdown);
  // A listener of `SIGTERM` keeps the process from ending on it, so this one is not left behind: the other handlers
  // end the process (the gateway exits once it flushed, the broker consumer of a worker raises the signal again once
  // nothing listens), and a process that has none ends as the signal would end it, once the spans are exported.
  process.once("SIGTERM", () => {
    const alone = process.listenerCount("SIGTERM") === 0;
    void shutdown().finally(() => {
      if (alone) process.kill(process.pid, "SIGTERM");
    });
  });

  return sdk;
}
