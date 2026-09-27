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
});
