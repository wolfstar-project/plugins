import { context, ROOT_CONTEXT, SpanStatusCode, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
  type ReadableSpan,
} from "@opentelemetry/sdk-trace";
import { Client } from "@wolfstar/http-framework";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { InteractionAttributes } from "../src/lib/attributes";
import openTelemetryPlugin from "../src/plugin";

const base = { discordPublicKey: "a".repeat(64), discordToken: "token" };

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

function createClient(interactions?: Parameters<typeof openTelemetryPlugin>[0]) {
  return new Client({
    ...base,
    plugins: [openTelemetryPlugin(interactions)],
  } as ConstructorParameters<typeof Client>[0]);
}

function command(name = "ping", overrides: Record<string, unknown> = {}) {
  return {
    command: { name },
    interaction: {
      id: "interaction-1",
      type: 2,
      guild_id: "guild-1",
      channel_id: "channel-1",
      data: { name },
      ...overrides,
    },
    response: {},
  };
}

function handler(name: string, type: number) {
  return {
    handler: { name },
    interaction: { id: "interaction-2", type, guild_id: "guild-1", channel_id: "channel-1" },
  };
}

function finished(): ReadableSpan[] {
  return exporter.getFinishedSpans();
}

/**
 * Runs the scenario in a context of its own: the listeners attach their span to the context of the flow that emits the
 * events, which would otherwise leak into the next test.
 */
function isolated<T>(scenario: () => Promise<T>): Promise<T> {
  return context.with(ROOT_CONTEXT, scenario);
}

describe("interaction spans", () => {
  test("GIVEN a command that succeeds THEN one span is exported when it finishes", async () => {
    const client = createClient();
    const event = command();

    await isolated(async () => {
      client.emit("commandRun", event as never);
      client.emit("commandSuccess", event as never, undefined);
      expect(finished()).toHaveLength(0);

      client.emit("commandFinish", event as never);
    });

    expect(finished()).toHaveLength(1);
    const [span] = finished();
    expect(span.name).toBe("command ping");
    expect(span.attributes).toMatchObject({
      [InteractionAttributes.Kind]: "command",
      [InteractionAttributes.Name]: "ping",
      [InteractionAttributes.Outcome]: "success",
      [InteractionAttributes.Id]: "interaction-1",
      [InteractionAttributes.GuildId]: "guild-1",
      [InteractionAttributes.ChannelId]: "channel-1",
    });
    expect(span.status.code).not.toBe(SpanStatusCode.ERROR);
  });

  test("GIVEN a command that throws THEN the span records the error", async () => {
    const client = createClient();
    const event = command();
    const failure = new Error("nope");

    await isolated(async () => {
      client.emit("commandRun", event as never);
      client.emit("commandError", failure, event as never);
      client.emit("commandFinish", event as never);
    });

    const [span] = finished();
    expect(span.attributes[InteractionAttributes.Outcome]).toBe("error");
    expect(span.status).toEqual({ code: SpanStatusCode.ERROR, message: "nope" });
    expect(span.events.map((entry) => entry.name)).toContain("exception");
  });

  test("GIVEN a thrown value that is not an Error THEN it is recorded as a message", async () => {
    const client = createClient();
    const event = command();

    await isolated(async () => {
      client.emit("commandRun", event as never);
      client.emit("commandError", "boom" as never, event as never);
      client.emit("commandFinish", event as never);
    });

    expect(finished()[0].status).toEqual({ code: SpanStatusCode.ERROR, message: "boom" });
  });

  // The spike of the issue: the run is not wrapped, so the span is entered from the `*Run` listener.
  test("GIVEN a command that awaits THEN what it starts is a child of the span, and the context is restored after the finish", async () => {
    const client = createClient();
    const event = command();
    const tracer = trace.getTracer("test");

    await isolated(async () => {
      expect(trace.getActiveSpan()).toBeUndefined();

      client.emit("commandRun", event as never);
      await new Promise((resolve) => setTimeout(resolve, 1));
      // What `pg` or `ioredis` would do while the command runs.
      tracer.startSpan("SELECT").end();

      client.emit("commandSuccess", event as never, undefined);
      client.emit("commandFinish", event as never);
      expect(trace.getActiveSpan()).toBeUndefined();
    });

    const spans = finished();
    const query = spans.find((span) => span.name === "SELECT")!;
    const interaction = spans.find((span) => span.name === "command ping")!;
    expect(query.parentSpanContext?.spanId).toBe(interaction.spanContext().spanId);
    expect(query.spanContext().traceId).toBe(interaction.spanContext().traceId);
  });

  test("GIVEN an active span when the command runs THEN the span is its child", async () => {
    const client = createClient();
    const event = command();
    const server = trace.getTracer("test").startSpan("POST /interactions");

    await isolated(async () => {
      await context.with(trace.setSpan(context.active(), server), async () => {
        client.emit("commandRun", event as never);
        client.emit("commandFinish", event as never);
      });
    });
    server.end();

    const interaction = finished().find((span) => span.name === "command ping")!;
    expect(interaction.parentSpanContext?.spanId).toBe(server.spanContext().spanId);
  });

  test("GIVEN two commands at once THEN each span is its own", async () => {
    const client = createClient();
    const first = command("first", { id: "1" });
    const second = command("second", { id: "2" });

    await Promise.all([
      isolated(async () => {
        client.emit("commandRun", first as never);
        await new Promise((resolve) => setTimeout(resolve, 5));
        expect(trace.getActiveSpan()).toBeDefined();
        client.emit("commandFinish", first as never);
      }),
      isolated(async () => {
        client.emit("commandRun", second as never);
        client.emit("commandFinish", second as never);
      }),
    ]);

    expect(
      finished()
        .map((span) => span.name)
        .toSorted(),
    ).toEqual(["command first", "command second"]);
  });

  test("GIVEN a finish with no run THEN nothing happens", async () => {
    const client = createClient();

    await isolated(async () => {
      client.emit("commandFinish", command() as never);
    });

    expect(finished()).toHaveLength(0);
  });

  test("GIVEN a guild-less interaction in a DM THEN the span has no guild", async () => {
    const client = createClient();
    const event = command("ping", {
      guild_id: undefined,
      channel_id: undefined,
      channel: { id: "dm-1" },
    });

    await isolated(async () => {
      client.emit("commandRun", event as never);
      client.emit("commandFinish", event as never);
    });

    const [span] = finished();
    expect(span.attributes).not.toHaveProperty(InteractionAttributes.GuildId);
    expect(span.attributes[InteractionAttributes.ChannelId]).toBe("dm-1");
  });
});

describe("which interactions get a span", () => {
  test("GIVEN the defaults THEN autocomplete is not traced", async () => {
    const client = createClient();
    const event = command("ping", { type: 4 });

    await isolated(async () => {
      client.emit("autocompleteRun", event as never);
      client.emit("autocompleteFinish", event as never);
    });

    expect(finished()).toHaveLength(0);
  });

  test("GIVEN autocomplete turned on THEN it is traced as such", async () => {
    const client = createClient({ interactions: { autocomplete: true } });
    const event = command("ping", { type: 4 });

    await isolated(async () => {
      client.emit("autocompleteRun", event as never);
      client.emit("autocompleteSuccess", event as never, undefined);
      client.emit("autocompleteFinish", event as never);
    });

    expect(finished()[0].name).toBe("autocomplete ping");
    expect(finished()[0].attributes[InteractionAttributes.Kind]).toBe("autocomplete");
  });

  test.each([
    ["a button", 3, "component"],
    ["a modal", 5, "modal"],
  ])("GIVEN %s THEN the span is a %s", async (_name, type, kind) => {
    const client = createClient();
    const event = handler("confirm", type);

    await isolated(async () => {
      client.emit("interactionHandlerRun", event as never);
      client.emit("interactionHandlerSuccess", event as never, undefined);
      client.emit("interactionHandlerFinish", event as never);
    });

    expect(finished()[0].name).toBe(`${kind} confirm`);
    expect(finished()[0].attributes[InteractionAttributes.Kind]).toBe(kind);
  });

  test("GIVEN commands turned off THEN they are not traced but handlers are", async () => {
    const client = createClient({ interactions: { commands: false } });
    const event = command();
    const button = handler("confirm", 3);

    await isolated(async () => {
      client.emit("commandRun", event as never);
      client.emit("commandFinish", event as never);
      client.emit("interactionHandlerRun", button as never);
      client.emit("interactionHandlerFinish", button as never);
    });

    expect(finished().map((span) => span.name)).toEqual(["component confirm"]);
  });

  test("GIVEN interactions turned off THEN nothing is traced", async () => {
    const client = createClient({ interactions: false });
    const event = command();

    await isolated(async () => {
      client.emit("commandRun", event as never);
      client.emit("commandFinish", event as never);
    });

    expect(finished()).toHaveLength(0);
  });
});
