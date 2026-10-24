// A worker thread for `preload.test.ts`: it answers whether an OpenTelemetry SDK runs in it, which the tracer provider of
// an SDK tells by having `forceFlush`.
import { trace } from "@opentelemetry/api";
import { parentPort } from "node:worker_threads";

const provider = trace.getTracerProvider();
// oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker port has no target origin.
parentPort?.postMessage(typeof (provider.getDelegate?.() ?? provider).forceFlush === "function");
