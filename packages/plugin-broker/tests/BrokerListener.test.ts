import { container } from "@wolfstar/http-framework";
import { afterEach, describe, expect, test, vi } from "vitest";
import { BrokerConsumer, BrokerListener, RegisterAsBrokerListener } from "../src/index.js";
import { FakeStreamRedis } from "./fixtures/FakeStreamRedis.js";

declare module "../src/lib/events.js" {
  interface BrokerEvents {
    messageCreate: string;
  }
}

function context(name: string): BrokerListener.LoaderContext {
  return {
    name,
    path: `/virtual/${name}.js`,
    root: "/virtual",
    store: container.stores.get("listeners"),
  };
}

function createConsumer() {
  return new BrokerConsumer({
    redis: new FakeStreamRedis(),
    stream: "events",
    group: "g",
    consumer: "c1",
  });
}

describe("BrokerListener", () => {
  afterEach(async () => {
    await container.stores.get("listeners").unloadAll();
  });

  test("GIVEN a listener THEN it binds to the broker consumer and receives dispatches", async () => {
    const consumer = createConsumer();
    const received: string[] = [];

    class MessageCreateListener extends BrokerListener<"messageCreate"> {
      public constructor(ctx: BrokerListener.LoaderContext) {
        super(ctx, { event: "messageCreate", emitter: consumer });
      }

      public override run(payload: string) {
        received.push(payload);
      }
    }

    const listener = new MessageCreateListener(context("message-create"));
    expect(listener.emitter).toBe(consumer);
    expect(listener.event).toBe("messageCreate");

    await container.stores.get("listeners").insert(listener);
    consumer.emit("messageCreate", "hello", { id: "1", event: "messageCreate" });

    expect(received).toEqual(["hello"]);
  });

  test("GIVEN the decorator THEN no constructor is needed", async () => {
    const consumer = createConsumer();
    const received: string[] = [];

    @RegisterAsBrokerListener("messageCreate", { emitter: consumer })
    class MessageCreateListener extends BrokerListener<"messageCreate"> {
      public override run(payload: string) {
        received.push(payload);
      }
    }

    const listener = new MessageCreateListener(context("decorated"), {} as never);
    expect(listener.emitter).toBe(consumer);
    expect(listener.event).toBe("messageCreate");
    expect(listener.once).toBe(false);

    await container.stores.get("listeners").insert(listener);
    consumer.emit("messageCreate", "decorated", { id: "1", event: "messageCreate" });

    expect(received).toEqual(["decorated"]);
  });

  test("GIVEN once THEN the listener unloads itself after its first run", async () => {
    const consumer = createConsumer();
    const received: string[] = [];

    @RegisterAsBrokerListener("messageCreate", { emitter: consumer, once: true })
    class MessageCreateListener extends BrokerListener<"messageCreate"> {
      public override run(payload: string) {
        received.push(payload);
      }
    }

    const store = container.stores.get("listeners");
    await store.insert(new MessageCreateListener(context("once"), {} as never));

    consumer.emit("messageCreate", "first", { id: "1", event: "messageCreate" });
    await vi.waitFor(() => expect(store.has("once")).toBe(false));
    consumer.emit("messageCreate", "second", { id: "2", event: "messageCreate" });

    await vi.waitFor(() => expect(received).toEqual(["first"]));
  });
});
