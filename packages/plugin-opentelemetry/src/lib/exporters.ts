import type { SpanExporter } from "@opentelemetry/sdk-trace";
import { getSentryOtlpEndpoint } from "./dsn.js";

/**
 * Creates the exporter the environment configures: the endpoint, the headers and the protocol are read from the
 * `OTEL_EXPORTER_OTLP_*` variables, and the protocol picks the exporter as the SDK does (`http/protobuf` when none is
 * given, and with a warning when it is not one of the three).
 *
 * @remarks
 * `OTEL_TRACES_EXPORTER` is honoured as far as turning this destination off: `none` on its own, as the SDK reads it,
 * gives no exporter. This package only exports OTLP, so any other value (`console`, `zipkin`, ...) still gets OTLP.
 *
 * @returns The exporter, `undefined` when `OTEL_TRACES_EXPORTER` is `none`.
 */
export async function createEnvironmentSpanExporter(): Promise<SpanExporter | undefined> {
  const requested = (process.env.OTEL_TRACES_EXPORTER ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  // `none` next to other exporters is ignored, as the SDK does.
  if (requested.length === 1 && requested[0] === "none") return undefined;

  const protocol =
    process.env.OTEL_EXPORTER_OTLP_TRACES_PROTOCOL ||
    process.env.OTEL_EXPORTER_OTLP_PROTOCOL ||
    "http/protobuf";

  switch (protocol) {
    case "grpc":
      return new (await import("@opentelemetry/exporter-trace-otlp-grpc")).OTLPTraceExporter();
    case "http/json":
      return new (await import("@opentelemetry/exporter-trace-otlp-http")).OTLPTraceExporter();
    case "http/protobuf":
      return new (await import("@opentelemetry/exporter-trace-otlp-proto")).OTLPTraceExporter();
    default:
      // The SDK has no logger yet, so `diag` would print nothing.
      console.warn(`Unsupported OTLP traces protocol: ${protocol}. Using http/protobuf.`);
      return new (await import("@opentelemetry/exporter-trace-otlp-proto")).OTLPTraceExporter();
  }
}

/**
 * Creates the exporter that sends the spans to the OTLP endpoint of the Sentry project of a DSN, as JSON (the encoding
 * the documentation of Sentry shows).
 *
 * @remarks
 * An OTLP exporter reads the `OTEL_EXPORTER_OTLP_*` variables when it is created, and adds their headers to the ones
 * it is given. Those are the headers of the first destination, with its token, so the variables are hidden while the
 * exporter is created: it only has the URL and the header of Sentry.
 *
 * @param dsn The DSN of the Sentry project.
 * @returns The exporter, `undefined` without a DSN or with one that cannot be read.
 */
export async function createSentrySpanExporter(
  dsn: string | undefined,
): Promise<SpanExporter | undefined> {
  const endpoint = getSentryOtlpEndpoint(dsn);
  if (!endpoint) return undefined;

  const { OTLPTraceExporter } = await import("@opentelemetry/exporter-trace-otlp-http");
  return withoutOtlpEnvironment(() => new OTLPTraceExporter(endpoint));
}

/**
 * Runs a function with the `OTEL_EXPORTER_OTLP_*` variables taken out of the environment, and puts them back after.
 */
function withoutOtlpEnvironment<T>(create: () => T): T {
  const hidden = Object.entries(process.env).filter(([name]) =>
    name.startsWith("OTEL_EXPORTER_OTLP_"),
  );
  for (const [name] of hidden) delete process.env[name];

  try {
    return create();
  } finally {
    for (const [name, value] of hidden) process.env[name] = value;
  }
}
