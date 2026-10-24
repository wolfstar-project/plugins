import { OTLPTraceExporter as GrpcTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { SimpleSpanProcessor, TracerProvider, type SpanExporter } from "@opentelemetry/sdk-trace";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { createEnvironmentSpanExporter, createSentrySpanExporter } from "../src/lib/exporters";

interface Received {
  url: string;
  headers: IncomingHttpHeaders;
  body: string;
}

/**
 * A receiver that records what it is sent and answers every export.
 */
function createReceiver(received: Received[]) {
  let server: Server;
  let port = 0;

  return {
    get port() {
      return port;
    },
    async start() {
      server = createServer((request, response) => {
        let body = "";
        request.on("data", (chunk: Buffer) => (body += chunk.toString()));
        request.on("end", () => {
          received.push({ url: request.url ?? "", headers: request.headers, body });
          response.writeHead(200, { "Content-Type": "application/json" }).end("{}");
        });
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      ({ port } = server.address() as AddressInfo);
    },
    async stop() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

async function exportOneSpan(exporter: SpanExporter): Promise<void> {
  const provider = new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter })] });
  provider.getTracer("test").startSpan("interaction").end();
  await provider.forceFlush();
  await provider.shutdown();
}

describe("createSentrySpanExporter", () => {
  const received: Received[] = [];
  const receiver = createReceiver(received);

  beforeAll(() => receiver.start());
  afterAll(() => receiver.stop());

  beforeEach(() => {
    received.length = 0;
    // What a first destination sets, its token included.
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://127.0.0.1:1");
    vi.stubEnv("OTEL_EXPORTER_OTLP_HEADERS", "Authorization=Bearer first-token");
    vi.stubEnv("OTEL_EXPORTER_OTLP_TRACES_HEADERS", "X-First-Project=star-network");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("GIVEN no DSN THEN no span goes to Sentry", async () => {
    await expect(createSentrySpanExporter(undefined)).resolves.toBeUndefined();
    await expect(createSentrySpanExporter("")).resolves.toBeUndefined();
  });

  test("GIVEN a DSN THEN the spans go to the OTLP endpoint of its project, with the key of Sentry and not the headers of the first destination", async () => {
    const exporter = await createSentrySpanExporter(
      `http://publickey@127.0.0.1:${receiver.port}/42`,
    );
    expect(exporter).toBeDefined();

    await exportOneSpan(exporter!);

    expect(received).toHaveLength(1);
    expect(received[0].url).toBe("/api/42/integration/otlp/v1/traces/");
    expect(received[0].headers["x-sentry-auth"]).toContain("sentry_key=publickey");
    expect(received[0].headers["content-type"]).toBe("application/json");
    expect(received[0].headers.authorization).toBeUndefined();
    expect(received[0].headers["x-first-project"]).toBeUndefined();
    expect(received[0].body).toContain("interaction");
  });

  test("GIVEN the exporter of Sentry is created THEN the variables of the first destination are back in the environment", async () => {
    await createSentrySpanExporter(`http://publickey@127.0.0.1:${receiver.port}/42`);

    expect(process.env.OTEL_EXPORTER_OTLP_ENDPOINT).toBe("http://127.0.0.1:1");
    expect(process.env.OTEL_EXPORTER_OTLP_HEADERS).toBe("Authorization=Bearer first-token");
    expect(process.env.OTEL_EXPORTER_OTLP_TRACES_HEADERS).toBe("X-First-Project=star-network");
  });
});

describe("createEnvironmentSpanExporter", () => {
  const received: Received[] = [];
  const receiver = createReceiver(received);

  beforeAll(() => receiver.start());
  afterAll(() => receiver.stop());

  beforeEach(() => {
    received.length = 0;
    vi.stubEnv("OTEL_EXPORTER_OTLP_ENDPOINT", `http://127.0.0.1:${receiver.port}`);
    vi.stubEnv("OTEL_EXPORTER_OTLP_HEADERS", "Authorization=Bearer first-token");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  test.each([
    ["no protocol, which is http/protobuf", undefined, undefined, "application/x-protobuf"],
    ["http/protobuf", "http/protobuf", undefined, "application/x-protobuf"],
    ["http/json", "http/json", undefined, "application/json"],
    ["http/json for the traces only", "http/protobuf", "http/json", "application/json"],
    ["a protocol it does not know", "carrier-pigeon", undefined, "application/x-protobuf"],
  ])(
    "GIVEN %s THEN the spans go to the endpoint of the environment with its headers, in the encoding of the protocol",
    async (_name, protocol, tracesProtocol, contentType) => {
      if (protocol) vi.stubEnv("OTEL_EXPORTER_OTLP_PROTOCOL", protocol);
      if (tracesProtocol) vi.stubEnv("OTEL_EXPORTER_OTLP_TRACES_PROTOCOL", tracesProtocol);
      vi.spyOn(console, "warn").mockImplementation(() => undefined);

      await exportOneSpan((await createEnvironmentSpanExporter())!);

      expect(received).toHaveLength(1);
      expect(received[0].url).toBe("/v1/traces");
      expect(received[0].headers["content-type"]).toBe(contentType);
      expect(received[0].headers.authorization).toBe("Bearer first-token");
    },
  );

  test("GIVEN a protocol it does not know THEN it says so", async () => {
    vi.stubEnv("OTEL_EXPORTER_OTLP_PROTOCOL", "carrier-pigeon");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await createEnvironmentSpanExporter();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("carrier-pigeon"));
  });

  test("GIVEN OTEL_TRACES_EXPORTER=none THEN there is no exporter for the environment", async () => {
    vi.stubEnv("OTEL_TRACES_EXPORTER", "none");

    await expect(createEnvironmentSpanExporter()).resolves.toBeUndefined();
  });

  test("GIVEN none next to another exporter THEN it is ignored, as the SDK does", async () => {
    vi.stubEnv("OTEL_TRACES_EXPORTER", "none, otlp");

    await exportOneSpan((await createEnvironmentSpanExporter())!);

    expect(received).toHaveLength(1);
  });

  test("GIVEN grpc THEN the exporter is the one of gRPC", async () => {
    vi.stubEnv("OTEL_EXPORTER_OTLP_PROTOCOL", "grpc");

    const exporter = await createEnvironmentSpanExporter();

    expect(exporter).toBeInstanceOf(GrpcTraceExporter);
    await exporter!.shutdown();
  });
});
