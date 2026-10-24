import { trace } from "@opentelemetry/api";
import { InMemorySpanExporter, TracerProvider, BatchSpanProcessor } from "@opentelemetry/sdk-trace";
import { afterEach, describe, expect, test, vi } from "vitest";
import { flushTraces } from "../src/lib/flush";
import { hasOtlpEndpoint } from "../src/lib/tracing";

afterEach(() => {
  trace.disable();
  vi.restoreAllMocks();
});

describe("flushTraces", () => {
  test("GIVEN no SDK THEN it resolves and does nothing", async () => {
    await expect(flushTraces()).resolves.toBeUndefined();
  });

  test("GIVEN an SDK with spans waiting THEN they are exported", async () => {
    const exporter = new InMemorySpanExporter();
    // Far from firing on its own: only the flush can export the span.
    const provider = new TracerProvider({
      spanProcessors: [new BatchSpanProcessor({ exporter, scheduledDelayMillis: 60_000 })],
    });
    trace.setGlobalTracerProvider(provider);

    trace.getTracer("test").startSpan("waiting").end();
    expect(exporter.getFinishedSpans()).toHaveLength(0);

    await flushTraces();

    expect(exporter.getFinishedSpans().map((span) => span.name)).toEqual(["waiting"]);
    await provider.shutdown();
  });

  test("GIVEN a flush that fails THEN it still resolves", async () => {
    const provider = new TracerProvider();
    vi.spyOn(provider, "forceFlush").mockRejectedValue(new Error("exporter is down"));
    trace.setGlobalTracerProvider(provider);

    await expect(flushTraces()).resolves.toBeUndefined();
  });
});

describe("hasOtlpEndpoint", () => {
  test.each([
    [{ OTEL_EXPORTER_OTLP_ENDPOINT: "http://collector:4318" }, true],
    [{ OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://collector:4318/v1/traces" }, true],
    [{ OTEL_EXPORTER_OTLP_ENDPOINT: "" }, false],
    [{ OTEL_EXPORTER_OTLP_HEADERS: "a=b" }, false],
    [{}, false],
  ])("GIVEN %j THEN it is %s", (env, expected) => {
    expect(hasOtlpEndpoint(env)).toBe(expected);
  });
});
