import { Client } from "@wolfstar/http-framework";
import { beforeEach, describe, expect, test, vi } from "vitest";
import evlogPlugin, { useInteractionLogger } from "../src/evlog-plugin";
import loggerPlugin from "../src/plugin";

const base = { discordPublicKey: "a".repeat(64), discordToken: "token" };

let events: Record<string, unknown>[];

beforeEach(() => {
  events = [];
});

function createClient(
  interactions?: Parameters<typeof evlogPlugin>[0] extends infer C
    ? C extends { interactions?: infer I }
      ? I
      : never
    : never,
) {
  return new Client({
    ...base,
    plugins: [
      evlogPlugin({
        silent: true,
        env: { service: "bot" },
        drain: (ctx) => void events.push(ctx.event),
        ...(interactions !== undefined && { interactions }),
      }),
      loggerPlugin(),
    ],
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
      locale: "en-US",
      member: { user: { id: "user-1" } },
      data: { name },
      ...overrides,
    },
    response: {},
  };
}

describe("interaction wide events", () => {
  test("GIVEN a command that succeeds THEN one wide event is drained when it finishes", async () => {
    const client = createClient();
    const context = command();

    client.emit("commandRun", context as never);
    client.emit("commandSuccess", context as never, undefined);
    expect(events).toHaveLength(0);
    client.emit("commandFinish", context as never);

    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events[0]).toMatchObject({
      level: "info",
      service: "bot",
      method: "COMMAND",
      path: "ping",
      requestId: "interaction-1",
      outcome: "success",
      guildId: "guild-1",
      channelId: "channel-1",
      userId: "user-1",
      locale: "en-US",
      durationMs: expect.any(Number),
    });
  });

  test("GIVEN a command that fails THEN the event is an error carrying it", async () => {
    const client = createClient();
    const context = command();
    const error = new Error("boom");

    client.emit("commandRun", context as never);
    client.emit("commandError", error, context as never);
    client.emit("commandFinish", context as never);

    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events[0]).toMatchObject({
      level: "error",
      outcome: "error",
      error: { name: "Error", message: "boom" },
    });
  });

  test("GIVEN a direct message THEN the user comes from the interaction and there is no guild", async () => {
    const client = createClient();
    const context = command("ping", {
      guild_id: undefined,
      member: undefined,
      user: { id: "dm-user" },
    });

    client.emit("commandRun", context as never);
    client.emit("commandFinish", context as never);

    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events[0]).toMatchObject({ userId: "dm-user" });
    expect(events[0]).not.toHaveProperty("guildId");
  });

  test("GIVEN interleaved interactions THEN each keeps its own event", async () => {
    const client = createClient();
    const first = command("first", { id: "one" });
    const second = command("second", { id: "two" });

    client.emit("commandRun", first as never);
    client.emit("commandRun", second as never);
    client.emit("commandError", new Error("only second"), second as never);
    client.emit("commandSuccess", first as never, undefined);
    client.emit("commandFinish", second as never);
    client.emit("commandFinish", first as never);

    await vi.waitFor(() => expect(events).toHaveLength(2));
    const byPath = Object.fromEntries(events.map((event) => [event.path, event]));
    expect(byPath.first).toMatchObject({ requestId: "one", outcome: "success" });
    expect(byPath.second).toMatchObject({ requestId: "two", outcome: "error" });
  });

  test("GIVEN a component or a modal handler THEN it is a wide event too", async () => {
    const client = createClient();
    const component = {
      handler: { name: "confirm" },
      interaction: { ...command().interaction, type: 3 },
      response: {},
    };
    const modal = {
      handler: { name: "feedback" },
      interaction: { ...command().interaction, id: "m", type: 5 },
      response: {},
    };

    for (const context of [component, modal]) {
      client.emit("interactionHandlerRun", context as never);
      client.emit("interactionHandlerSuccess", context as never, undefined);
      client.emit("interactionHandlerFinish", context as never);
    }

    await vi.waitFor(() => expect(events).toHaveLength(2));
    expect(events.map((event) => [event.method, event.path])).toEqual([
      ["COMPONENT", "confirm"],
      ["MODAL", "feedback"],
    ]);
  });

  test("GIVEN autocomplete THEN it is off by default, as it fires on every keystroke", async () => {
    const client = createClient();
    const context = command("search", { type: 4 });

    client.emit("autocompleteRun", context as never);
    client.emit("autocompleteFinish", context as never);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(events).toHaveLength(0);
  });

  test("GIVEN autocomplete: true THEN it is drained", async () => {
    const client = createClient({ autocomplete: true });
    const context = command("search", { type: 4 });

    client.emit("autocompleteRun", context as never);
    client.emit("autocompleteSuccess", context as never, undefined);
    client.emit("autocompleteFinish", context as never);

    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events[0]).toMatchObject({ method: "AUTOCOMPLETE", path: "search" });
  });

  test("GIVEN interactions: false THEN nothing is drained", async () => {
    const client = createClient(false);
    const context = command();

    client.emit("commandRun", context as never);
    client.emit("commandFinish", context as never);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(events).toHaveLength(0);
  });

  test("GIVEN commands: false THEN only the other kinds are drained", async () => {
    const client = createClient({ commands: false });
    const context = command();

    client.emit("commandRun", context as never);
    client.emit("commandFinish", context as never);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(events).toHaveLength(0);
  });
});

// The framework emits `*Run` and then awaits the command in the same async flow, which is what
// this reproduces: the code under test runs after an async boundary, like a command would.
async function run(
  client: Client,
  context: ReturnType<typeof command>,
  body: () => void | Promise<void>,
) {
  client.emit("commandRun", context as never);
  await new Promise((resolve) => setTimeout(resolve, 5));
  await body();
  client.emit("commandSuccess", context as never, undefined);
  client.emit("commandFinish", context as never);
}

describe("useInteractionLogger", () => {
  test("GIVEN code running a command THEN the logger enriches the interaction's wide event", async () => {
    const client = createClient();

    await run(client, command(), () => {
      useInteractionLogger().set({ cart: { items: 3 } });
    });

    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events[0]).toMatchObject({ path: "ping", cart: { items: 3 }, outcome: "success" });
  });

  test("GIVEN concurrent commands THEN each one enriches its own event", async () => {
    const client = createClient();

    await Promise.all([
      run(client, command("first", { id: "one" }), async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        useInteractionLogger().set({ who: "first" });
      }),
      run(client, command("second", { id: "two" }), () => {
        useInteractionLogger().set({ who: "second" });
      }),
    ]);

    await vi.waitFor(() => expect(events).toHaveLength(2));
    const byPath = Object.fromEntries(events.map((event) => [event.path, event]));
    expect(byPath.first).toMatchObject({ who: "first" });
    expect(byPath.second).toMatchObject({ who: "second" });
  });

  test("GIVEN code outside any interaction THEN it throws, like evlog's useLogger", () => {
    createClient();

    expect(() => useInteractionLogger()).toThrow();
  });

  test("GIVEN the interaction finished THEN the logger is no longer reachable", async () => {
    const client = createClient();
    const context = command();

    client.emit("commandRun", context as never);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(() => useInteractionLogger()).not.toThrow();

    client.emit("commandFinish", context as never);

    expect(() => useInteractionLogger()).toThrow();
  });
});
