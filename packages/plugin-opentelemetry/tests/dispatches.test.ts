import { context, ROOT_CONTEXT, SpanStatusCode, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
  type ReadableSpan,
} from "@opentelemetry/sdk-trace";
import { GatewayClient } from "@wolfstar/plugin-gateway";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { DispatchAttributes } from "../src/lib/attributes";
import openTelemetryPlugin, { type OpenTelemetryPluginOptions } from "../src/plugin";

const exporter = new InMemorySpanExporter();
const provider = new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter })] });

beforeAll(() => {
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  trace.setGlobalTracerProvider(provider);
});

afterAll(async () => {
  trace.disable();
  context.disable();
  await provider.shutdown();
});

beforeEach(() => {
  exporter.reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function createClient(options?: OpenTelemetryPluginOptions) {
  return new GatewayClient({
    discordPublicKey: "0".repeat(64),
    discordToken: "test-token",
    clientId: "266624760782258186",
    intents: 0,
    cache: null,
    plugins: [openTelemetryPlugin(options)],
  });
}

function send(client: GatewayClient, t: string, d: Record<string, unknown>, shardId = 0) {
  // `WebSocketShardEvents.Dispatch` of `@discordjs/ws`.
  client.gateway.emit("dispatch" as never, { op: 0, s: 1, t, d } as never, shardId as never);
}

const typing = { channel_id: "20", guild_id: "10", user_id: "30", timestamp: 0 };

function dispatchSpans(): ReadableSpan[] {
  return exporter.getFinishedSpans().filter((span) => span.name.startsWith("dispatch "));
}

describe("dispatch spans", () => {
  test("GIVEN a dispatch THEN its span is the root of a trace and the parent of what its listeners start", async () => {
    const client = createClient();
    client.on("typingStart", () => {
      trace.getTracer("test").startSpan("listener work").end();
    });

    // Like `@discordjs/ws`, which receives every dispatch in the context of the request that opened the WebSocket.
    const handshake = trace.getTracer("test").startSpan("GET /gateway");
    context.with(trace.setSpan(ROOT_CONTEXT, handshake), () =>
      send(client, "TYPING_START", typing, 2),
    );
    await client.idle();
    handshake.end();

    const [dispatch] = dispatchSpans();
    const work = exporter.getFinishedSpans().find((span) => span.name === "listener work")!;
    expect(dispatch!.name).toBe("dispatch TYPING_START");
    expect(dispatch!.parentSpanContext).toBeUndefined();
    expect(dispatch!.spanContext().traceId).not.toBe(handshake.spanContext().traceId);
    expect(work.parentSpanContext?.spanId).toBe(dispatch!.spanContext().spanId);
    expect(dispatch!.attributes).toEqual({
      [DispatchAttributes.Type]: "TYPING_START",
      [DispatchAttributes.ShardId]: 2,
      [DispatchAttributes.Partition]: "guild:10",
      [DispatchAttributes.GuildId]: "10",
      [DispatchAttributes.Outcome]: "success",
    });
  });

  test.each(["GUILD_CREATE", "GUILD_UPDATE", "GUILD_DELETE"])(
    "GIVEN a %s dispatch, whose guild is its id THEN the span carries the guild",
    async (type) => {
      const client = createClient();
      client.on("error", () => undefined);

      send(client, type, { id: "10", unavailable: true });
      await client.idle();

      const [dispatch] = dispatchSpans();
      expect(dispatch!.attributes[DispatchAttributes.GuildId]).toBe("10");
    },
  );

  test("GIVEN a failing listener THEN the span records the error and the client still reports it", async () => {
    const client = createClient();
    const errors: unknown[] = [];
    client.on("error", (error) => errors.push(error));
    client.on("typingStart", () => {
      throw new Error("listener failed");
    });

    send(client, "TYPING_START", typing);
    await client.idle();

    const [dispatch] = dispatchSpans();
    expect(dispatch!.status).toEqual({ code: SpanStatusCode.ERROR, message: "listener failed" });
    expect(dispatch!.attributes[DispatchAttributes.Outcome]).toBe("error");
    expect(dispatch!.events.map((event) => event.name)).toEqual(["exception"]);
    expect(errors).toHaveLength(1);
  });

  test("GIVEN ignored types THEN those dispatches get no span", async () => {
    const client = createClient({ dispatches: { ignore: ["TYPING_START"] } });
    const started: unknown[] = [];
    client.on("typingStart", (typingStart) => started.push(typingStart));

    send(client, "TYPING_START", typing);
    await client.idle();

    expect(started).toHaveLength(1);
    expect(dispatchSpans()).toEqual([]);
  });

  test("GIVEN dispatches false THEN no dispatch gets a span", async () => {
    const client = createClient({ dispatches: false });

    send(client, "TYPING_START", typing);
    await client.idle();

    expect(dispatchSpans()).toEqual([]);
  });
});

describe("flushing on destroy", () => {
  test("GIVEN a destroyed gateway client THEN the traces are flushed", async () => {
    const client = createClient();
    vi.spyOn(client.gateway, "destroy").mockResolvedValue();
    const flush = vi.spyOn(provider, "forceFlush");

    await client.destroy();

    expect(flush).toHaveBeenCalledTimes(1);
  });

  test("GIVEN flushOnDestroy false THEN destroy does not flush", async () => {
    const client = createClient({ flushOnDestroy: false });
    vi.spyOn(client.gateway, "destroy").mockResolvedValue();
    const flush = vi.spyOn(provider, "forceFlush");

    await client.destroy();

    expect(flush).not.toHaveBeenCalled();
  });
});
