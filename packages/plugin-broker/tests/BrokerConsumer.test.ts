import { afterEach, describe, expect, test, vi } from "vitest";
import { BrokerConsumer, createBroker, type BrokerConsumerOptions } from "../src/index.js";
import { FakeStreamRedis } from "./fixtures/FakeStreamRedis.js";

function options(
  redis: FakeStreamRedis,
  consumer = "c1",
  extra: Partial<BrokerConsumerOptions> = {},
): BrokerConsumerOptions {
  return { redis, stream: "events", group: "g", consumer, batchSize: 10, block: 20, ...extra };
}

function pending(redis: FakeStreamRedis) {
  return redis.xpending("events", "g", "-", "+", 100) as Promise<
    [id: string, consumer: string, idle: number, deliveries: number][]
  >;
}

function fail() {
  throw new Error("boom");
}

describe("BrokerConsumer", () => {
  const consumers: BrokerConsumer[] = [];

  afterEach(async () => {
    await Promise.all(consumers.map((consumer) => consumer.stop()));
    consumers.length = 0;
    vi.restoreAllMocks();
  });

  function start(opts: BrokerConsumerOptions) {
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
    await vi.waitFor(async () => expect(await pending(redis)).toEqual([]));
  });

  test("GIVEN a throwing listener THEN the entry is left pending", async () => {
    const redis = new FakeStreamRedis();
    const broker = createBroker({ redis, stream: "events" });
    const consumer = start(options(redis));
    consumer.on("messageCreate", fail);

    await consumer.start();
    await broker.publish("messageCreate", { id: "1" });

    await vi.waitFor(async () => expect(await pending(redis)).toHaveLength(1));
  });

  test("GIVEN an entry published with a state and shard THEN the message carries both", async () => {
    const redis = new FakeStreamRedis();
    const broker = createBroker({ redis, stream: "events" });
    const consumer = start(options(redis));
    const messages: unknown[] = [];
    consumer.on("messageCreate", (_payload: unknown, message: unknown) => messages.push(message));

    await consumer.start();
    await broker.publish("messageCreate", { id: "1" }, { state: { content: "old" }, shard: 3 });

    await vi.waitFor(() => expect(messages).toHaveLength(1));
    expect(messages[0]).toMatchObject({
      event: "messageCreate",
      state: { content: "old" },
      shard: 3,
    });
  });

  test("GIVEN an entry published without options THEN the message has no state or shard", async () => {
    const redis = new FakeStreamRedis();
    const broker = createBroker({ redis, stream: "events" });
    const consumer = start(options(redis));
    const messages: object[] = [];
    consumer.on("messageCreate", (_payload: unknown, message: object) => messages.push(message));

    await consumer.start();
    await broker.publish("messageCreate", { id: "1" });

    await vi.waitFor(() => expect(messages).toHaveLength(1));
    expect("state" in messages[0]!).toBe(false);
    expect("shard" in messages[0]!).toBe(false);
  });

  test("GIVEN an entry whose state cannot be decoded THEN it is left pending and no listener runs", async () => {
    const redis = new FakeStreamRedis();
    const consumer = start(options(redis));
    const listener = vi.fn();
    consumer.on("messageCreate", listener);

    await consumer.start();
    const payload = Buffer.from(JSON.stringify({ id: "1" })).toString("base64");
    await redis.xadd(
      "events",
      "*",
      "event",
      "messageCreate",
      "payload",
      payload,
      "state",
      "bm90LWpzb24=",
    );

    await vi.waitFor(async () => expect(await pending(redis)).toHaveLength(1));
    expect(listener).not.toHaveBeenCalled();
  });

  test("GIVEN a restarted consumer with the same name THEN its own pending entries are redelivered", async () => {
    const redis = new FakeStreamRedis();
    const broker = createBroker({ redis, stream: "events" });
    const first = start(options(redis));
    first.on("messageCreate", fail);

    await first.start();
    await broker.publish("messageCreate", { id: "1" });
    await vi.waitFor(async () => expect(await pending(redis)).toHaveLength(1));
    await first.stop();

    const restarted = start(options(redis));
    const received: unknown[] = [];
    restarted.on("messageCreate", (payload: unknown) => received.push(payload));
    await restarted.start();

    await vi.waitFor(() => expect(received).toEqual([{ id: "1" }]));
  });

  test("GIVEN a pending entry that fails again on restart THEN new entries are still read", async () => {
    const redis = new FakeStreamRedis();
    const broker = createBroker({ redis, stream: "events" });
    const first = start(options(redis));
    first.on("poison", fail);

    await first.start();
    await broker.publish("poison", { id: "1" });
    await vi.waitFor(async () => expect(await pending(redis)).toHaveLength(1));
    await first.stop();

    const restarted = start(options(redis));
    const received: unknown[] = [];
    restarted.on("poison", fail);
    restarted.on("messageCreate", (payload: unknown) => received.push(payload));
    await restarted.start();
    await broker.publish("messageCreate", { id: "2" });

    await vi.waitFor(() => expect(received).toEqual([{ id: "2" }]));
  });

  test("GIVEN no listener for the event THEN the entry is acked anyway", async () => {
    const redis = new FakeStreamRedis();
    const broker = createBroker({ redis, stream: "events" });
    const consumer = start(options(redis));

    await consumer.start();
    await broker.publish("unhandled", { id: "1" });

    await vi.waitFor(async () => {
      expect(redis.entriesOf("events")).toHaveLength(1);
      expect(await pending(redis)).toEqual([]);
    });
  });

  test("GIVEN a pending entry trimmed from the stream THEN it is acked without being dispatched", async () => {
    const redis = new FakeStreamRedis();
    const broker = createBroker({ redis, stream: "events", maxLength: 1 });
    const first = start(options(redis));
    first.on("messageCreate", fail);

    await first.start();
    await broker.publish("messageCreate", { id: "1" });
    await vi.waitFor(async () => expect(await pending(redis)).toHaveLength(1));
    await first.stop();
    // Trims the pending entry away.
    await broker.publish("other", { id: "2" });

    const restarted = start(options(redis));
    const received: unknown[] = [];
    restarted.on("messageCreate", (payload: unknown) => received.push(payload));
    await restarted.start();

    await vi.waitFor(async () => expect(await pending(redis)).toEqual([]));
    expect(received).toEqual([]);
  });

  describe("claimIdle", () => {
    test("GIVEN an entry left pending by a consumer that never restarts THEN another consumer claims it", async () => {
      const redis = new FakeStreamRedis();
      const broker = createBroker({ redis, stream: "events" });
      const dead = start(options(redis, "dead"));
      dead.on("messageCreate", fail);

      await dead.start();
      await broker.publish("messageCreate", { id: "1" });
      await vi.waitFor(async () => expect(await pending(redis)).toHaveLength(1));
      await dead.stop();
      redis.age("events", "g", 60_000);

      const other = start(options(redis, "other", { claimIdle: 60_000 }));
      const received: unknown[] = [];
      other.on("messageCreate", (payload: unknown) => received.push(payload));
      await other.start();

      await vi.waitFor(() => expect(received).toEqual([{ id: "1" }]));
      await vi.waitFor(async () => expect(await pending(redis)).toEqual([]));
    });

    test("GIVEN an entry not idle for long enough THEN it is not claimed", async () => {
      const redis = new FakeStreamRedis();
      const broker = createBroker({ redis, stream: "events" });
      const busy = start(options(redis, "busy"));
      busy.on("messageCreate", fail);

      await busy.start();
      await broker.publish("messageCreate", { id: "1" });
      await vi.waitFor(async () => expect(await pending(redis)).toHaveLength(1));
      await busy.stop();

      const other = start(options(redis, "other", { claimIdle: 60_000 }));
      const received: unknown[] = [];
      other.on("messageCreate", (payload: unknown) => received.push(payload));
      await other.start();
      await new Promise((resolve) => setTimeout(resolve, 60));

      expect(received).toEqual([]);
      expect((await pending(redis))[0]![1]).toBe("busy");
    });
  });

  describe("maxDeliveries", () => {
    test("GIVEN an entry failing past maxDeliveries THEN it is moved to the dead-letter stream", async () => {
      const redis = new FakeStreamRedis();
      const broker = createBroker({ redis, stream: "events" });
      const consumer = start(options(redis, "c1", { claimIdle: 1, maxDeliveries: 3 }));
      const listener = vi.fn(fail);
      consumer.on("messageCreate", listener);

      await consumer.start();
      const id = await broker.publish("messageCreate", { id: "1" });

      await vi.waitFor(() => expect(redis.entriesOf("events:dead")).toHaveLength(1));
      expect(listener).toHaveBeenCalledTimes(3);
      expect(await pending(redis)).toEqual([]);

      const [{ fields }] = redis.entriesOf("events:dead");
      const record = Object.fromEntries(
        fields.flatMap((_, index) => (index % 2 === 0 ? [[fields[index], fields[index + 1]]] : [])),
      );
      expect(record).toMatchObject({
        event: "messageCreate",
        id,
        stream: "events",
        group: "g",
        consumer: "c1",
        deliveries: "4",
      });
      expect(record.payload).toBe(redis.entriesOf("events")[0]!.fields[3]);
    });

    test("GIVEN deadLetterStream THEN dead-lettered entries go there", async () => {
      const redis = new FakeStreamRedis();
      const broker = createBroker({ redis, stream: "events" });
      const consumer = start(
        options(redis, "c1", { claimIdle: 1, maxDeliveries: 1, deadLetterStream: "graveyard" }),
      );
      consumer.on("messageCreate", fail);

      await consumer.start();
      await broker.publish("messageCreate", { id: "1" });

      await vi.waitFor(() => expect(redis.entriesOf("graveyard")).toHaveLength(1));
      expect(redis.entriesOf("events:dead")).toHaveLength(0);
    });

    test("GIVEN a redelivered entry within maxDeliveries THEN it is dispatched", async () => {
      const redis = new FakeStreamRedis();
      const broker = createBroker({ redis, stream: "events" });
      const first = start(options(redis));
      first.on("messageCreate", fail);

      await first.start();
      await broker.publish("messageCreate", { id: "1" });
      await vi.waitFor(async () => expect(await pending(redis)).toHaveLength(1));
      await first.stop();

      const restarted = start(options(redis, "c1", { maxDeliveries: 2 }));
      const received: unknown[] = [];
      restarted.on("messageCreate", (payload: unknown) => received.push(payload));
      await restarted.start();

      await vi.waitFor(() => expect(received).toEqual([{ id: "1" }]));
      expect(redis.entriesOf("events:dead")).toHaveLength(0);
    });

    test.each([0, -1, 1.5, Number.NaN])(
      "GIVEN maxDeliveries %s THEN it throws",
      (maxDeliveries) => {
        expect(
          () => new BrokerConsumer(options(new FakeStreamRedis(), "c1", { maxDeliveries })),
        ).toThrow(RangeError);
      },
    );

    test.each([0, -1, Number.NaN])("GIVEN claimIdle %s THEN it throws", (claimIdle) => {
      expect(() => new BrokerConsumer(options(new FakeStreamRedis(), "c1", { claimIdle }))).toThrow(
        RangeError,
      );
    });
  });

  describe("shutdownSignals", () => {
    const signal = "SIGHUP";

    test("GIVEN a signal with no other listener THEN it stops the consumer and raises the signal again", async () => {
      expect(process.listenerCount(signal)).toBe(0);
      const kill = vi.spyOn(process, "kill").mockImplementation(() => true);
      const redis = new FakeStreamRedis();
      const consumer = start(options(redis, "c1", { shutdownSignals: [signal] }));
      const stop = vi.spyOn(consumer, "stop");

      await consumer.start();
      expect(process.listenerCount(signal)).toBe(1);
      process.emit(signal, signal);

      await vi.waitFor(() => expect(kill).toHaveBeenCalledWith(process.pid, signal));
      expect(stop).toHaveBeenCalledOnce();
      expect(process.listenerCount(signal)).toBe(0);
    });

    test("GIVEN a signal another listener handles THEN it only stops the consumer", async () => {
      const kill = vi.spyOn(process, "kill").mockImplementation(() => true);
      const other = vi.fn();
      process.on(signal, other);
      try {
        const redis = new FakeStreamRedis();
        const consumer = start(options(redis, "c1", { shutdownSignals: [signal] }));
        const stop = vi.spyOn(consumer, "stop");

        await consumer.start();
        process.emit(signal, signal);

        await vi.waitFor(() => expect(stop).toHaveBeenCalledOnce());
        await stop.mock.results[0]!.value;
        expect(kill).not.toHaveBeenCalled();
        expect(other).toHaveBeenCalledOnce();
      } finally {
        process.off(signal, other);
      }
    });

    test("GIVEN stop THEN the signal handlers are removed", async () => {
      const redis = new FakeStreamRedis();
      const consumer = start(options(redis, "c1", { shutdownSignals: [signal] }));

      await consumer.start();
      expect(process.listenerCount(signal)).toBe(1);
      await consumer.stop();

      expect(process.listenerCount(signal)).toBe(0);
    });
  });
});
