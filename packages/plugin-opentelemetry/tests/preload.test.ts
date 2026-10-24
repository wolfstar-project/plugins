import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import { build } from "tsdown";
import { beforeAll, describe, expect, test } from "vitest";

const packageDirectory = fileURLToPath(new URL("../", import.meta.url));
// Inside the package, so the bare specifiers of the build resolve from its `node_modules`.
const outDir = fileURLToPath(new URL("../node_modules/.cache/preload-test/", import.meta.url));
const fixture = (name: string) => fileURLToPath(new URL(`fixtures/${name}`, import.meta.url));

let preload: string;

// The CI unit job runs vitest without a build, and the preload is loaded by a process of its own, so it is built here.
beforeAll(async () => {
  mkdirSync(outDir, { recursive: true });
  await build({
    config: false,
    cwd: packageDirectory,
    entry: { preload: "src/preload.ts" },
    outDir,
    format: "esm",
    platform: "node",
    dts: false,
    clean: true,
    deps: { neverBundle: true },
    tsconfig: fileURLToPath(new URL("../../../tsconfig.build.json", import.meta.url)),
    logLevel: "silent",
  });
  preload = pathToFileURL(`${outDir}preload.mjs`).href;
}, 60_000);

describe("the preload in a worker thread", () => {
  // The regular expression workers of a bot inherit `--import`, and must not start an SDK each.
  test("GIVEN a worker thread THEN the SDK does not start in it", async () => {
    const worker = new Worker(fixture("tracerProviderWorker.mjs"), {
      execArgv: ["--import", preload],
      env: { ...process.env, OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:1", SENTRY_DSN: "" },
    });

    const started = await new Promise<boolean>((resolve, reject) => {
      worker.once("message", resolve);
      worker.once("error", reject);
    });
    await worker.terminate();

    expect(started).toBe(false);
  });
});

describe("the preload without an endpoint", () => {
  test("GIVEN no OTLP endpoint THEN the SDK does not start", async () => {
    const env = { ...process.env, SENTRY_DSN: "" };
    delete env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;

    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          "--import",
          preload,
          "--input-type=module",
          "-e",
          'import { trace } from "@opentelemetry/api"; const p = trace.getTracerProvider(); process.stdout.write(String(typeof (p.getDelegate?.() ?? p).forceFlush));',
        ],
        { cwd: packageDirectory, env, stdio: ["ignore", "pipe", "inherit"] },
      );
      let data = "";
      child.stdout.on("data", (chunk: Buffer) => (data += chunk.toString()));
      child.once("error", reject);
      child.once("exit", () => resolve(data));
    });

    expect(output).toBe("undefined");
  }, 20_000);
});

// A Windows process cannot handle `SIGTERM`: `kill` ends it at once, so the cases below only mean something elsewhere.
describe.skipIf(process.platform === "win32")("the preload on SIGTERM", () => {
  // The OTLP endpoint does not answer: the export fails at once, and nothing else keeps the process up.
  const env = {
    ...process.env,
    OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:1",
    OTEL_METRICS_EXPORTER: "none",
    OTEL_LOGS_EXPORTER: "none",
    OTEL_NODE_RESOURCE_DETECTORS: "none",
    SENTRY_DSN: "",
  };

  function terminate(mode: string) {
    const child = spawn(
      process.execPath,
      ["--import", preload, fixture("sigtermProcess.mjs"), mode],
      {
        cwd: packageDirectory,
        env,
        stdio: ["ignore", "pipe", "ignore"],
      },
    );

    return new Promise<NodeJS.Signals | null>((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("The process is still running after SIGTERM."));
      }, 8000);
      child.stdout.once("data", () => child.kill("SIGTERM"));
      child.once("exit", (_code, signal) => {
        clearTimeout(timer);
        resolve(signal);
      });
    });
  }

  test("GIVEN a process whose other handler raises the signal again once nothing listens (the broker consumer of a worker) THEN it still ends", async () => {
    await expect(terminate("broker")).resolves.toBe("SIGTERM");
  }, 10_000);

  test("GIVEN a process with no other handler THEN it ends as the signal ends it, once the spans are exported", async () => {
    await expect(terminate("alone")).resolves.toBe("SIGTERM");
  }, 10_000);
});

describe("the preload on a WebSocket", () => {
  // The connection of the gateway lasts for hours, and the dispatches handled meanwhile ran in its context: every span of
  // the bot ended up in one trace that never closed.
  test("GIVEN the handshake of a WebSocket THEN it is not traced, and a regular request is", async () => {
    const urls: string[] = [];
    const receiver = createServer((request, response) => {
      let body = "";
      request.on("data", (chunk: Buffer) => (body += chunk.toString()));
      request.on("end", () => {
        const { resourceSpans } = JSON.parse(body) as {
          resourceSpans: {
            scopeSpans: {
              spans: { attributes: { key: string; value: { stringValue?: string } }[] }[];
            }[];
          }[];
        };
        for (const span of resourceSpans.flatMap((resource) =>
          resource.scopeSpans.flatMap((scope) => scope.spans),
        )) {
          const url = span.attributes.find((attribute) => attribute.key === "url.full")?.value
            .stringValue;
          if (url) urls.push(new URL(url).pathname + new URL(url).search);
        }
        response.writeHead(200, { "Content-Type": "application/json" }).end("{}");
      });
    });
    await new Promise<void>((resolve) => receiver.listen(0, "127.0.0.1", resolve));
    const { port } = receiver.address() as AddressInfo;

    const child = spawn(
      process.execPath,
      ["--import", preload, fixture("websocketHandshake.mjs")],
      {
        cwd: packageDirectory,
        env: {
          ...process.env,
          OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${port}`,
          OTEL_EXPORTER_OTLP_PROTOCOL: "http/json",
          OTEL_METRICS_EXPORTER: "none",
          OTEL_LOGS_EXPORTER: "none",
          OTEL_NODE_RESOURCE_DETECTORS: "none",
          OTEL_NODE_DISABLED_INSTRUMENTATIONS: "net,dns",
          SENTRY_DSN: "",
        },
        stdio: "ignore",
      },
    );
    // The child and the receiver are stopped whatever happens, before the timeout of the test.
    const deadline = setTimeout(() => child.kill("SIGKILL"), 10_000);
    let code: number | null;
    try {
      code = await new Promise<number | null>((resolve) => child.once("exit", resolve));
    } finally {
      clearTimeout(deadline);
      await new Promise((resolve) => receiver.close(resolve));
    }

    expect(code).toBe(0);
    expect(urls).toContain("/api/v10/gateway/bot");
    expect(urls).not.toContain("/?v=10&encoding=json");
  }, 15_000);
});
