import { describe, expect, test } from "vitest";
import { getSentryOtlpEndpoint, parseSentryDsn } from "../src/lib/dsn";

describe("parseSentryDsn", () => {
  test("GIVEN a DSN THEN it gives the key, the host and the project", () => {
    expect(parseSentryDsn("https://publickey@o0.ingest.sentry.io:8443/42")).toEqual({
      publicKey: "publickey",
      origin: "https://o0.ingest.sentry.io:8443",
      prefix: "",
      project: "42",
      hostname: "o0.ingest.sentry.io",
    });
  });

  test("GIVEN a DSN with a path THEN what comes before the project is the prefix", () => {
    expect(parseSentryDsn("https://publickey@sentry.example.com/a/b/7")).toMatchObject({
      prefix: "/a/b",
      project: "7",
    });
  });

  test.each([undefined, "", "not a dsn", "https://publickey@sentry.example.com"])(
    "GIVEN %j THEN there is nothing to read",
    (dsn) => {
      expect(parseSentryDsn(dsn)).toBeUndefined();
    },
  );
});

describe("getSentryOtlpEndpoint", () => {
  test("GIVEN a DSN THEN the endpoint is the OTLP one of its project, with the key as the only header", () => {
    expect(getSentryOtlpEndpoint("https://publickey@o0.ingest.sentry.io/42")).toEqual({
      url: "https://o0.ingest.sentry.io/api/42/integration/otlp/v1/traces/",
      headers: { "x-sentry-auth": "sentry sentry_key=publickey" },
    });
  });

  test("GIVEN a DSN with a path THEN the endpoint keeps it", () => {
    expect(getSentryOtlpEndpoint("https://publickey@sentry.example.com/sentry/42")?.url).toBe(
      "https://sentry.example.com/sentry/api/42/integration/otlp/v1/traces/",
    );
  });

  test.each([undefined, "", "not a dsn", "https://sentry.example.com/42"])(
    "GIVEN %j THEN there is no endpoint",
    (dsn) => {
      expect(getSentryOtlpEndpoint(dsn)).toBeUndefined();
    },
  );
});
