import { Client, container } from "@wolfstar/http-framework";
import { beforeEach, describe, expect, test, vi } from "vitest";
import evlogPlugin, { defineEvlogDrain, type EvlogDrain } from "../src/evlog-plugin";
import { EvlogTransport } from "../src/evlog";
import type { Logger } from "../src/lib/Logger";
import loggerPlugin from "../src/plugin";

const base = { discordPublicKey: "a".repeat(64), discordToken: "token" };

type Context = Parameters<EvlogDrain>[0];

let events: Context["event"][];

beforeEach(() => {
  events = [];
});

// The plugins are listed in the order the Stars module registers them: evlog, then logger.
function createClient(
  evlog: ReturnType<typeof evlogPlugin>,
  logger?: ConstructorParameters<typeof Client>[0]["logger"],
) {
  return new Client({
    ...base,
    logger,
    plugins: [evlog, loggerPlugin()],
  } as ConstructorParameters<typeof Client>[0]);
}

describe("evlogPlugin", () => {
  test("GIVEN the factory THEN the plugin is named and runs before the others", () => {
    const plugin = evlogPlugin() as { name: string; enforce?: string };

    expect(plugin.name).toBe("@wolfstar/plugin-logger:evlog");
    expect(plugin.enforce).toBe("pre");
  });

  test("GIVEN a drain THEN container.logger entries reach it as structured events", async () => {
    createClient(
      evlogPlugin({
        env: { service: "bot" },
        silent: true,
        drain: (ctx) => void events.push(ctx.event),
      }),
    );

    container.logger.info("User joined", { guildId: "1" });

    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events[0]).toMatchObject({
      level: "info",
      service: "bot",
      tag: "http-framework",
      message: "User joined",
      guildId: "1",
    });
  });

  test("GIVEN a tag option THEN entries are written under it", async () => {
    createClient(
      evlogPlugin({ silent: true, tag: "bot", drain: (ctx) => void events.push(ctx.event) }),
    );

    container.logger.warn("slow");

    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events[0]).toMatchObject({ level: "warn", tag: "bot" });
  });

  test("GIVEN pipeline: true THEN events are batched and closing the logger flushes them", async () => {
    createClient(
      evlogPlugin({
        silent: true,
        pipeline: true,
        drain: (batch) => void events.push(...batch.map((ctx) => ctx.event)),
      }),
    );

    container.logger.info("buffered");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(events).toHaveLength(0);

    await (container.logger as Logger).close();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ message: "buffered" });
  });

  test("GIVEN pipeline options THEN they configure the batching", async () => {
    createClient(
      evlogPlugin({
        silent: true,
        pipeline: { batch: { size: 1 } },
        drain: (batch) => void events.push(...batch.map((ctx) => ctx.event)),
      }),
    );

    container.logger.info("flushed by size");

    await vi.waitFor(() => expect(events).toHaveLength(1));
  });

  test("GIVEN a drain with a flush THEN it is used as it is and closing flushes it", async () => {
    const drain = Object.assign((ctx: Context) => void events.push(ctx.event), {
      flush: vi.fn(async () => undefined),
    });
    createClient(evlogPlugin({ silent: true, drain }));

    container.logger.info("direct");
    await vi.waitFor(() => expect(events).toHaveLength(1));
    await (container.logger as Logger).close();

    expect(drain.flush).toHaveBeenCalledOnce();
  });

  test("GIVEN no drain THEN the transport is installed and closing is harmless", async () => {
    createClient(evlogPlugin({ silent: true }));

    const { transports } = container.logger as Logger;

    expect(transports).toHaveLength(1);
    expect(transports[0]).toBeInstanceOf(EvlogTransport);
    await expect((container.logger as Logger).close()).resolves.toBeUndefined();
  });

  test("GIVEN no config at all THEN the plugin still installs", () => {
    createClient(evlogPlugin());

    expect((container.logger as Logger).transports[0]).toBeInstanceOf(EvlogTransport);
  });

  test("GIVEN transports in ClientOptions.logger THEN the evlog one is added after them", () => {
    const own = { log: () => undefined };

    createClient(evlogPlugin({ silent: true }), { transports: [own] });

    const { transports } = container.logger as Logger;
    expect(transports).toHaveLength(2);
    expect(transports[0]).toBe(own);
    expect(transports[1]).toBeInstanceOf(EvlogTransport);
  });
});

describe("defineEvlogDrain", () => {
  test("GIVEN the inline options THEN the factory builds the plugin with them and the drain", async () => {
    const factory = defineEvlogDrain((ctx) => void events.push(ctx.event));

    createClient(factory({ env: { service: "bot" }, silent: true, tag: "inline" }));
    container.logger.info("hello");

    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events[0]).toMatchObject({ service: "bot", tag: "inline", message: "hello" });
  });

  test("GIVEN pipeline in the inline options THEN the drain is wrapped in it", async () => {
    const factory = defineEvlogDrain(
      ((batch: Context[]) => void events.push(...batch.map((ctx) => ctx.event))) as never,
    );

    createClient(factory({ silent: true, pipeline: true }));
    container.logger.info("buffered");
    await (container.logger as Logger).close();

    expect(events).toHaveLength(1);
  });

  test("GIVEN no options THEN the factory still works", () => {
    createClient(defineEvlogDrain(() => undefined)());

    expect((container.logger as Logger).transports[0]).toBeInstanceOf(EvlogTransport);
  });
});
