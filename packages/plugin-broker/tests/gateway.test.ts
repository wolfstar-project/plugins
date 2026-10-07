import { EventEmitter } from "node:events";
import { describe, expect, test, vi } from "vitest";
import {
  BrokerConsumer,
  createBroker,
  forwardGatewayDispatches,
  type Broker,
  type GatewayDispatchEmitterLike,
} from "../src/index.js";
import { FakeStreamRedis } from "./fixtures/FakeStreamRedis.js";

function gateway() {
  return new EventEmitter() as EventEmitter & GatewayDispatchEmitterLike;
}

describe("forwardGatewayDispatches", () => {
  test("GIVEN a dispatch THEN it is published under its type with its data", async () => {
    const redis = new FakeStreamRedis();
    const broker = createBroker({ redis, stream: "events" });
    const consumer = new BrokerConsumer({
      redis,
      stream: "events",
      group: "g",
      consumer: "c",
      block: 20,
    });
    const received: unknown[] = [];
    consumer.on("MESSAGE_CREATE", (payload: unknown) => received.push(payload));
    const client = gateway();

    await consumer.start();
    forwardGatewayDispatches(client, broker);
    client.emit("dispatch", { t: "MESSAGE_CREATE", d: { id: "1" } }, 0);

    await vi.waitFor(() => expect(received).toEqual([{ id: "1" }]));
    await consumer.stop();
  });

  test("GIVEN events THEN only those dispatches are published", () => {
    const publish = vi.fn<Broker["publish"]>().mockResolvedValue("1-0");
    const client = gateway();

    forwardGatewayDispatches(client, { publish }, { events: ["MESSAGE_CREATE"] });
    client.emit("dispatch", { t: "TYPING_START", d: {} }, 0);
    client.emit("dispatch", { t: "MESSAGE_CREATE", d: { id: "1" } }, 0);

    expect(publish).toHaveBeenCalledExactlyOnceWith("MESSAGE_CREATE", { id: "1" });
  });

  test("GIVEN dispatches THEN they are published in order", () => {
    const publish = vi.fn<Broker["publish"]>().mockResolvedValue("1-0");
    const client = gateway();

    forwardGatewayDispatches(client, { publish });
    client.emit("dispatch", { t: "A", d: 1 }, 0);
    client.emit("dispatch", { t: "B", d: 2 }, 0);

    expect(publish.mock.calls).toEqual([
      ["A", 1],
      ["B", 2],
    ]);
  });

  test("GIVEN a failing publish THEN onError receives the error and the payload", async () => {
    const error = new Error("down");
    const publish = vi.fn<Broker["publish"]>().mockRejectedValue(error);
    const onError = vi.fn();
    const client = gateway();
    const payload = { t: "MESSAGE_CREATE", d: { id: "1" } };

    forwardGatewayDispatches(client, { publish }, { onError });
    client.emit("dispatch", payload, 0);

    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(error, payload));
  });

  test("GIVEN the returned function THEN forwarding stops", () => {
    const publish = vi.fn<Broker["publish"]>().mockResolvedValue("1-0");
    const client = gateway();

    const stop = forwardGatewayDispatches(client, { publish });
    stop();
    client.emit("dispatch", { t: "MESSAGE_CREATE", d: {} }, 0);

    expect(publish).not.toHaveBeenCalled();
    expect(client.listenerCount("dispatch")).toBe(0);
  });

  test("GIVEN an emitter that serializes state THEN the serialized state is published with the dispatch", () => {
    const publish = vi.fn<Broker["publish"]>().mockResolvedValue("1-0");
    const serializeDispatchState = vi.fn((_type: string, state: unknown) => ({ raw: state }));
    const client = Object.assign(gateway(), { serializeDispatchState });

    forwardGatewayDispatches(client, { publish });
    client.emit("dispatch", { t: "MESSAGE_UPDATE", d: { id: "1" } }, 0, { cached: true });

    expect(serializeDispatchState).toHaveBeenCalledWith("MESSAGE_UPDATE", { cached: true });
    expect(publish).toHaveBeenCalledExactlyOnceWith(
      "MESSAGE_UPDATE",
      { id: "1" },
      { state: { raw: { cached: true } } },
    );
  });

  test("GIVEN a dispatch from a shard other than 0 THEN the shard is published", () => {
    const publish = vi.fn<Broker["publish"]>().mockResolvedValue("1-0");
    const client = gateway();

    forwardGatewayDispatches(client, { publish });
    client.emit("dispatch", { t: "MESSAGE_CREATE", d: { id: "1" } }, 2);

    expect(publish).toHaveBeenCalledExactlyOnceWith("MESSAGE_CREATE", { id: "1" }, { shard: 2 });
  });

  test("GIVEN a dispatch with a sequence number THEN it is published", () => {
    const publish = vi.fn<Broker["publish"]>().mockResolvedValue("1-0");
    const client = gateway();

    forwardGatewayDispatches(client, { publish });
    client.emit("dispatch", { t: "MESSAGE_CREATE", d: { id: "1" }, s: 7 }, 0);

    expect(publish).toHaveBeenCalledExactlyOnceWith("MESSAGE_CREATE", { id: "1" }, { sequence: 7 });
  });

  test("GIVEN a state and an emitter that cannot serialize it THEN no state is published", () => {
    const publish = vi.fn<Broker["publish"]>().mockResolvedValue("1-0");
    const client = gateway();

    forwardGatewayDispatches(client, { publish });
    client.emit("dispatch", { t: "MESSAGE_UPDATE", d: { id: "1" } }, 0, { cached: true });

    expect(publish).toHaveBeenCalledExactlyOnceWith("MESSAGE_UPDATE", { id: "1" });
  });

  test("GIVEN a serializer that throws THEN the dispatch is still published, without state, and onError is told", () => {
    const publish = vi.fn<Broker["publish"]>().mockResolvedValue("1-0");
    const error = new Error("cannot serialize");
    const client = Object.assign(gateway(), {
      serializeDispatchState: () => {
        throw error;
      },
    });
    const onError = vi.fn();
    const payload = { t: "MESSAGE_UPDATE", d: { id: "1" } };

    forwardGatewayDispatches(client, { publish }, { onError });
    client.emit("dispatch", payload, 0, { cached: true });

    expect(publish).toHaveBeenCalledExactlyOnceWith("MESSAGE_UPDATE", { id: "1" });
    expect(onError).toHaveBeenCalledExactlyOnceWith(error, payload);
  });

  test("GIVEN a serializer and an onError that both throw THEN the dispatch is still published", () => {
    const publish = vi.fn<Broker["publish"]>().mockResolvedValue("1-0");
    const client = Object.assign(gateway(), {
      serializeDispatchState: () => {
        throw new Error("cannot serialize");
      },
    });
    const onError = vi.fn(() => {
      throw new Error("cannot report");
    });

    forwardGatewayDispatches(client, { publish }, { onError });
    client.emit("dispatch", { t: "MESSAGE_UPDATE", d: { id: "1" } }, 0, { cached: true });

    expect(publish).toHaveBeenCalledExactlyOnceWith("MESSAGE_UPDATE", { id: "1" });
  });

  test("GIVEN a failing publish and an onError that throws THEN the failure is not left unhandled", async () => {
    const publish = vi.fn<Broker["publish"]>().mockRejectedValue(new Error("redis down"));
    const onError = vi.fn(() => {
      throw new Error("cannot report");
    });
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);

    try {
      const client = gateway();
      forwardGatewayDispatches(client, { publish }, { onError });
      client.emit("dispatch", { t: "MESSAGE_CREATE", d: { id: "1" } }, 0);
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(onError).toHaveBeenCalledOnce();
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });
});
