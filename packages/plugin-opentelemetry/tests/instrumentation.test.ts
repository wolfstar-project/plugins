import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} from "@opentelemetry/sdk-trace";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  getInstrumentationConfig,
  isSentryEnvelopeRequest,
  isWebSocketHandshake,
  redactDiscordTokens,
} from "../src/lib/instrumentation";

describe("redactDiscordTokens", () => {
  test.each([
    ["/api/v10/webhooks/1/secret-token", "/api/v10/webhooks/1/REDACTED"],
    ["/api/v10/webhooks/1/secret-token/messages/2", "/api/v10/webhooks/1/REDACTED/messages/2"],
    [
      "/api/v10/webhooks/1/secret-token/messages/@original",
      "/api/v10/webhooks/1/REDACTED/messages/@original",
    ],
    ["/api/v10/interactions/1/secret-token/callback", "/api/v10/interactions/1/REDACTED/callback"],
    ["/api/v10/channels/1/webhooks", "/api/v10/channels/1/webhooks"],
    ["/api/v10/webhooks/1", "/api/v10/webhooks/1"],
    ["/api/v10/channels/1/messages", "/api/v10/channels/1/messages"],
  ])("GIVEN %s THEN it becomes %s", (path, expected) => {
    expect(redactDiscordTokens(path)).toBe(expected);
  });
});

describe("the instrumentation of undici", () => {
  const exporter = new InMemorySpanExporter();
  const provider = new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter })] });
  const instrumentation = new UndiciInstrumentation(
    getInstrumentationConfig()["@opentelemetry/instrumentation-undici"],
  );
  let server: Server;
  let port: number;

  beforeAll(async () => {
    instrumentation.setTracerProvider(provider);
    instrumentation.enable();
    server = createServer((request, response) => {
      request.resume();
      request.on("end", () => response.writeHead(204).end());
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    ({ port } = server.address() as AddressInfo);
  });

  afterAll(async () => {
    instrumentation.disable();
    await provider.shutdown();
    await new Promise((resolve) => server.close(resolve));
  });

  // A log sent through the webhook of its channel, and the answer to an interaction, carry their token in the URL.
  test("GIVEN a request to a webhook of Discord THEN its span does not hold the token", async () => {
    await fetch(`http://127.0.0.1:${port}/api/v10/webhooks/1/secret-token?wait=true`, {
      method: "POST",
    });
    await provider.forceFlush();

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(JSON.stringify(spans[0].attributes)).not.toContain("secret-token");
    expect(spans[0].attributes["url.path"]).toBe("/api/v10/webhooks/1/REDACTED");
    expect(spans[0].attributes["url.full"]).toBe(
      `http://127.0.0.1:${port}/api/v10/webhooks/1/REDACTED?wait=true`,
    );
  });
});

describe("isSentryEnvelopeRequest", () => {
  const dsn = "https://publickey@o0.ingest.sentry.io/42";

  // What the transport of Sentry gives `https.request`, its key in the query.
  test.each([
    [
      "the envelope of Sentry",
      {
        hostname: "o0.ingest.sentry.io",
        path: "/api/42/envelope/?sentry_version=7&sentry_key=publickey",
      },
      true,
    ],
    [
      "the envelope with the port in the host",
      { host: "o0.ingest.sentry.io:443", path: "/api/42/envelope/?sentry_key=publickey" },
      true,
    ],
    [
      "another request to the host of Sentry",
      { hostname: "o0.ingest.sentry.io", path: "/api/42/security/" },
      false,
    ],
    [
      "another host with the same path",
      { hostname: "influx.example.com", path: "/api/42/envelope/" },
      false,
    ],
  ])("GIVEN %s THEN it is told apart from the other requests", (_name, request, expected) => {
    expect(isSentryEnvelopeRequest(request, dsn)).toBe(expected);
  });

  test("GIVEN a DSN with a path, as a Sentry hosted under one THEN only the envelope of its project is one of Sentry", () => {
    const hosted = "https://publickey@sentry.example.com/sentry/42";

    expect(
      isSentryEnvelopeRequest(
        { hostname: "sentry.example.com", path: "/sentry/api/42/envelope/?sentry_key=publickey" },
        hosted,
      ),
    ).toBe(true);
    expect(
      isSentryEnvelopeRequest(
        { hostname: "sentry.example.com", path: "/api/42/envelope/" },
        hosted,
      ),
    ).toBe(false);
    expect(
      isSentryEnvelopeRequest(
        { hostname: "sentry.example.com", path: "/sentry/api/7/envelope/" },
        hosted,
      ),
    ).toBe(false);
  });

  test("GIVEN the envelope of another project on the same host THEN it is not the one of the DSN", () => {
    expect(
      isSentryEnvelopeRequest({ hostname: "o0.ingest.sentry.io", path: "/api/7/envelope/" }, dsn),
    ).toBe(false);
  });

  test("GIVEN no DSN, or one that cannot be read THEN no request is one of Sentry", () => {
    const request = { hostname: "o0.ingest.sentry.io", path: "/api/42/envelope/" };

    expect(isSentryEnvelopeRequest(request, undefined)).toBe(false);
    expect(isSentryEnvelopeRequest(request, "not a dsn")).toBe(false);
  });

  test("GIVEN the configuration of the instrumentations THEN the http one leaves the transport of Sentry out", () => {
    const { ignoreOutgoingRequestHook } =
      getInstrumentationConfig(dsn)["@opentelemetry/instrumentation-http"];

    expect(
      ignoreOutgoingRequestHook({
        hostname: "o0.ingest.sentry.io",
        path: "/api/42/envelope/?sentry_key=publickey",
      }),
    ).toBe(true);
    expect(
      ignoreOutgoingRequestHook({ hostname: "influx.example.com", path: "/api/v2/write" }),
    ).toBe(false);
  });

  test("GIVEN the configuration of the instrumentations THEN the http one leaves the handshake of a WebSocket out", () => {
    const { ignoreOutgoingRequestHook } =
      getInstrumentationConfig()["@opentelemetry/instrumentation-http"];

    expect(ignoreOutgoingRequestHook({ headers: { Upgrade: "websocket" } })).toBe(true);
    expect(ignoreOutgoingRequestHook({ headers: {} })).toBe(false);
  });
});

describe("isWebSocketHandshake", () => {
  test.each([
    ["the handshake of `ws`", { headers: { Connection: "Upgrade", Upgrade: "websocket" } }, true],
    ["an upgrade header in lower case", { headers: { upgrade: "WebSocket" } }, true],
    [
      "headers given as a flat list",
      { headers: ["Connection", "Upgrade", "Upgrade", "websocket"] },
      true,
    ],
    ["an upgrade to something else", { headers: { Upgrade: "h2c" } }, false],
    ["a regular request", { headers: { "Content-Type": "application/json" } }, false],
    ["a request with no headers", {}, false],
  ])("GIVEN %s THEN it is told apart from the other requests", (_name, request, expected) => {
    expect(isWebSocketHandshake(request)).toBe(expected);
  });
});
