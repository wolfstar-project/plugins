import { afterEach, describe, expect, test, vi } from "vitest";
import { BrokerConsumer, createBroker } from "../src/index.js";
import { FakeStreamRedis } from "./fixtures/FakeStreamRedis.js";

function options(redis: FakeStreamRedis, consumer = "c1") {
  return { redis, stream: "events", group: "g", consumer, batchSize: 10, block: 20 };
}

describe("BrokerConsumer", () => {
  const consumers: BrokerConsumer[] = [];

  afterEach(async () => {
    await Promise.all(consumers.map((consumer) => consumer.stop()));
    consumers.length = 0;
  });

  function start(opts: ReturnType<typeof options>) {
    const consumer = new BrokerConsumer(opts);
    consumers.push(consumer);
    return consumer;
  }

  test("GIVEN a second start on an existing group THEN it does not throw", async () => {
    const redis = new FakeStreamRedis();
    const a = start(options(redis));
    const b = start(options(redis, "c2"));

    await a.start();
    await expect(b.start()).resolves.toBeUndefined();
  });

  test("GIVEN a registered listener THEN a published entry is dispatched and acked", async () => {
    const redis = new FakeStreamRedis();
    const broker = createBroker({ redis, stream: "events" });
    const consumer = start(options(redis));
    const received: unknown[] = [];
    consumer.on("messageCreate", (payload: unknown) => received.push(payload));

    await consumer.start();
    await broker.publish("messageCreate", { id: "1" });

    await vi.waitFor(() => expect(received).toEqual([{ id: "1" }]));
    await vi.waitFor(async () => {
      const pending = await redis.xreadgroup(
        "GROUP",
        "g",
        "c1",
        "COUNT",
        10,
        "STREAMS",
        "events",
        "0",
      );
      expect(pending).toBeNull();
    });
  });

  test("GIVEN a throwing listener THEN the entry is left pending", async () => {
    const redis = new FakeStreamRedis();
    const broker = createBroker({ redis, stream: "events" });
    const consumer = start(options(redis));
    consumer.on("messageCreate", () => {
      throw new Error("boom");
    });

    await consumer.start();
    await broker.publish("messageCreate", { id: "1" });

    await vi.waitFor(async () => {
      const pending = await redis.xreadgroup(
        "GROUP",
        "g",
        "c1",
        "COUNT",
        10,
        "STREAMS",
        "events",
        "0",
      );
      expect(pending).not.toBeNull();
    });
  });

  test("GIVEN a restarted consumer with the same name THEN its own pending entries are redelivered", async () => {
    const redis = new FakeStreamRedis();
    const broker = createBroker({ redis, stream: "events" });
    const first = start(options(redis));
    first.on("messageCreate", () => {
      throw new Error("boom");
    });

    await first.start();
    await broker.publish("messageCreate", { id: "1" });
    await vi.waitFor(async () => {
      const pending = await redis.xreadgroup(
        "GROUP",
        "g",
        "c1",
        "COUNT",
        10,
        "STREAMS",
        "events",
        "0",
      );
      expect(pending).not.toBeNull();
    });
    await first.stop();

    const restarted = start(options(redis));
    const received: unknown[] = [];
    restarted.on("messageCreate", (payload: unknown) => received.push(payload));
    await restarted.start();

    await vi.waitFor(() => expect(received).toEqual([{ id: "1" }]));
  });

  test("GIVEN no listener for the event THEN the entry is acked anyway", async () => {
    const redis = new FakeStreamRedis();
    const broker = createBroker({ redis, stream: "events" });
    const consumer = start(options(redis));

    await consumer.start();
    await broker.publish("unhandled", { id: "1" });

    await vi.waitFor(async () => {
      const pending = await redis.xreadgroup(
        "GROUP",
        "g",
        "c1",
        "COUNT",
        10,
        "STREAMS",
        "events",
        "0",
      );
      expect(pending).toBeNull();
    });
  });
});
