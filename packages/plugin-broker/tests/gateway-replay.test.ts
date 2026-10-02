import { createInMemoryCache } from "@wolfstar/plugin-cache";
import { GatewayClient } from "@wolfstar/plugin-gateway";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  BrokerConsumer,
  createBroker,
  forwardGatewayDispatches,
  replayGatewayDispatches,
  type GatewayReplayTargetLike,
} from "../src/index.js";
import { FakeStreamRedis } from "./fixtures/FakeStreamRedis.js";

const guildId = "100000000000000010";
const channelId = "200000000000000020";
const author = {
  id: "600000000000000600",
  username: "wolf",
  discriminator: "0",
  global_name: "Wolf",
  avatar: null,
};

function message(extra: object = {}) {
  return {
    id: "1200000000000000000",
    channel_id: channelId,
    guild_id: guildId,
    author,
    content: "hello",
    timestamp: "2026-01-01T00:00:00.000Z",
    edited_timestamp: null,
    tts: false,
    mention_everyone: false,
    mentions: [],
    mention_roles: [],
    attachments: [],
    embeds: [],
    pinned: false,
    type: 0,
    ...extra,
  };
}

function clients() {
  const cache = createInMemoryCache();
  const options = {
    discordPublicKey: "0".repeat(64),
    discordToken: "test-token",
    clientId: "266624760782258186",
    intents: 0,
    cache,
  };
  return { producer: new GatewayClient(options), worker: new GatewayClient(options) };
}

async function feed(client: GatewayClient, t: string, d: unknown) {
  // `"dispatch"` is `WebSocketShardEvents.Dispatch`.
  client.gateway.emit("dispatch" as never, { op: 0, s: 1, t, d } as never, 0 as never);
  await client.idle();
}

describe("replayGatewayDispatches", () => {
  const consumers: BrokerConsumer[] = [];
  afterEach(async () => {
    await Promise.all(consumers.map((consumer) => consumer.stop()));
    consumers.length = 0;
  });

  function setup() {
    const redis = new FakeStreamRedis();
    const broker = createBroker({ redis, stream: "events" });
    const consumer = new BrokerConsumer({
      redis,
      stream: "events",
      group: "workers",
      consumer: "w1",
      block: 20,
    });
    consumers.push(consumer);
    return { redis, broker, consumer, ...clients() };
  }

  test("GIVEN a gateway process and a worker THEN the worker's listener gets the producer's arguments, old included", async () => {
    const { broker, consumer, producer, worker } = setup();
    forwardGatewayDispatches(producer, broker);
    replayGatewayDispatches(consumer, worker);

    const received: unknown[][] = [];
    worker.on("messageUpdate", (...args) => void received.push(args));
    const dispatchedOnWorker = vi.fn();
    worker.on("dispatch", dispatchedOnWorker);

    await consumer.start();
    await feed(producer, "MESSAGE_CREATE", message());
    await feed(producer, "MESSAGE_UPDATE", message({ content: "edited" }));

    await vi.waitFor(() => expect(received).toHaveLength(1));
    const [previous, current] = received[0] as [{ content: string }, { content: string }];
    expect(previous.content).toBe("hello");
    expect(current.content).toBe("edited");
    expect(dispatchedOnWorker).not.toHaveBeenCalled();
  });

  test("GIVEN events THEN only those dispatch types are replayed", async () => {
    const { broker, consumer, producer, worker } = setup();
    forwardGatewayDispatches(producer, broker);
    replayGatewayDispatches(consumer, worker, { events: ["MESSAGE_UPDATE"] });

    const created = vi.fn();
    const updated = vi.fn();
    worker.on("messageCreate", created);
    worker.on("messageUpdate", updated);

    await consumer.start();
    await feed(producer, "MESSAGE_CREATE", message());
    await feed(producer, "MESSAGE_UPDATE", message({ content: "edited" }));

    await vi.waitFor(() => expect(updated).toHaveBeenCalledOnce());
    expect(created).not.toHaveBeenCalled();
  });

  test("GIVEN a legacy entry (no state, no shard) THEN it replays on shard 0", async () => {
    const { broker, consumer } = setup();
    const replayDispatch = vi.fn<GatewayReplayTargetLike["replayDispatch"]>().mockResolvedValue();
    const reviveDispatchState = vi
      .fn<GatewayReplayTargetLike["reviveDispatchState"]>()
      .mockResolvedValue(undefined);
    replayGatewayDispatches(consumer, {
      replayDispatchTypes: ["MESSAGE_CREATE"],
      replayDispatch,
      reviveDispatchState,
    });

    await consumer.start();
    await broker.publish("MESSAGE_CREATE", { id: "1" });

    await vi.waitFor(() =>
      expect(replayDispatch).toHaveBeenCalledExactlyOnceWith(
        { t: "MESSAGE_CREATE", d: { id: "1" } },
        0,
        undefined,
      ),
    );
    expect(reviveDispatchState).toHaveBeenCalledExactlyOnceWith("MESSAGE_CREATE", undefined, {
      id: "1",
    });
  });

  test("GIVEN an entry with state THEN a plain listener still gets the payload", async () => {
    const { broker, consumer } = setup();
    const plainListener = vi.fn();
    consumer.on("MESSAGE_UPDATE", plainListener);

    await consumer.start();
    await broker.publish("MESSAGE_UPDATE", { id: "1" }, { state: { id: "1" }, shard: 1 });

    await vi.waitFor(() => expect(plainListener).toHaveBeenCalledOnce());
    expect(plainListener.mock.calls[0]![0]).toEqual({ id: "1" });
  });

  test("GIVEN a throwing worker listener THEN the entry stays pending and its redelivery replays it", async () => {
    const { redis, broker, consumer, producer, worker } = setup();
    forwardGatewayDispatches(producer, broker);
    replayGatewayDispatches(consumer, worker);

    let attempts = 0;
    worker.on("messageCreate", () => {
      if (++attempts === 1) throw new Error("boom");
    });

    await consumer.start();
    await feed(producer, "MESSAGE_CREATE", message());

    await vi.waitFor(() => expect(attempts).toBe(1));
    await vi.waitFor(async () =>
      expect(await redis.xpending("events", "workers", "-", "+", 10)).toHaveLength(1),
    );

    // A restart of the same consumer name redelivers its pending entries first.
    await consumer.stop();
    const restarted = new BrokerConsumer({
      redis,
      stream: "events",
      group: "workers",
      consumer: "w1",
      block: 20,
    });
    consumers.push(restarted);
    replayGatewayDispatches(restarted, worker);
    await restarted.start();

    await vi.waitFor(() => expect(attempts).toBe(2));
    await vi.waitFor(async () =>
      expect(await redis.xpending("events", "workers", "-", "+", 10)).toEqual([]),
    );
  });

  test("GIVEN an async worker listener rejecting THEN the entry stays pending and its redelivery replays it", async () => {
    const { redis, broker, consumer, producer, worker } = setup();
    forwardGatewayDispatches(producer, broker);
    replayGatewayDispatches(consumer, worker);

    let attempts = 0;
    worker.on("messageCreate", async () => {
      await Promise.resolve();
      if (++attempts === 1) throw new Error("boom");
    });
    worker.on("error", () => {});

    await consumer.start();
    await feed(producer, "MESSAGE_CREATE", message());

    await vi.waitFor(() => expect(attempts).toBe(1));
    await vi.waitFor(async () =>
      expect(await redis.xpending("events", "workers", "-", "+", 10)).toHaveLength(1),
    );

    await consumer.stop();
    const restarted = new BrokerConsumer({
      redis,
      stream: "events",
      group: "workers",
      consumer: "w1",
      block: 20,
    });
    consumers.push(restarted);
    replayGatewayDispatches(restarted, worker);
    await restarted.start();

    await vi.waitFor(() => expect(attempts).toBe(2));
    await vi.waitFor(async () =>
      expect(await redis.xpending("events", "workers", "-", "+", 10)).toEqual([]),
    );
  });

  test("GIVEN a dispatch type the worker has no action for THEN it is acknowledged", async () => {
    const { redis, broker, consumer, worker } = setup();
    replayGatewayDispatches(consumer, worker, { events: ["SOMETHING_NEW"] });

    await consumer.start();
    await broker.publish("SOMETHING_NEW", { a: 1 });

    await vi.waitFor(async () =>
      expect(await redis.xpending("events", "workers", "-", "+", 10)).toEqual([]),
    );
  });

  test("GIVEN the returned function THEN the listeners are removed", async () => {
    const { broker, consumer } = setup();
    const replayDispatch = vi.fn<GatewayReplayTargetLike["replayDispatch"]>().mockResolvedValue();
    const stop = replayGatewayDispatches(consumer, {
      replayDispatchTypes: ["MESSAGE_CREATE"],
      replayDispatch,
      reviveDispatchState: async () => undefined,
    });

    stop();
    await consumer.start();
    await broker.publish("MESSAGE_CREATE", { id: "1" });
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(replayDispatch).not.toHaveBeenCalled();
  });
});
