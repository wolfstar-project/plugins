import { WebSocketShardEvents } from "@discordjs/ws";
import { container } from "@wolfstar/http-framework";
import {
  GatewayDispatchEvents,
  GatewayOpcodes,
  type APIUser,
  type GatewayDispatchPayload,
} from "discord-api-types/v10";
import { afterEach, describe, expect, test } from "vitest";
import {
  EventGatewayListener,
  GatewayClient,
  RegisterAsDispatchListener,
  RegisterAsGatewayListener,
  gatewayOnlyEvents,
  GatewayEvents,
  type User,
} from "../src/index.js";

const user: APIUser = {
  id: "1",
  username: "wolf",
  discriminator: "0",
  global_name: null,
  avatar: null,
};

function createClient() {
  return new GatewayClient({
    discordPublicKey: "0".repeat(64),
    discordToken: "test-token",
    clientId: "266624760782258186",
    intents: 0,
  });
}

function context(name: string): EventGatewayListener.LoaderContext {
  return {
    name,
    path: `/virtual/${name}.js`,
    root: "/virtual",
    store: container.stores.get("listeners"),
  };
}

async function sendUserUpdate(client: GatewayClient, username: string) {
  const payload = {
    op: GatewayOpcodes.Dispatch,
    s: 1,
    t: GatewayDispatchEvents.UserUpdate,
    d: { ...user, username },
  } as GatewayDispatchPayload;
  client.gateway.emit(WebSocketShardEvents.Dispatch, payload, 0);
  await client.idle();
}

describe("EventGatewayListener", () => {
  afterEach(async () => {
    await container.stores.get("listeners").unloadAll();
  });

  test("GIVEN a listener THEN it is bound to the client and receives structures", async () => {
    const client = createClient();
    const received: string[] = [];

    class UserUpdateListener extends EventGatewayListener<"userUpdate"> {
      public constructor(ctx: EventGatewayListener.LoaderContext) {
        super(ctx, { event: "userUpdate" });
      }

      public override run(_previous: User | null, current: User) {
        received.push(current.username);
      }
    }

    const listener = new UserUpdateListener(context("user-update"));
    expect(listener.emitter).toBe(client);
    expect(listener.event).toBe("userUpdate");

    await container.stores.get("listeners").insert(listener);
    await sendUserUpdate(client, "renamed");

    expect(received).toEqual(["renamed"]);
  });

  test("GIVEN the decorator THEN no constructor is needed", async () => {
    const client = createClient();
    const received: string[] = [];

    @RegisterAsGatewayListener("userUpdate")
    class UserUpdateListener extends EventGatewayListener<"userUpdate"> {
      public override run(_previous: User | null, current: User) {
        received.push(current.username);
      }
    }

    const listener = new UserUpdateListener(context("decorated"), {} as never);
    expect(listener.emitter).toBe(client);
    expect(listener.event).toBe("userUpdate");
    expect(listener.once).toBe(false);

    await container.stores.get("listeners").insert(listener);
    await sendUserUpdate(client, "decorated");

    expect(received).toEqual(["decorated"]);
  });

  test("GIVEN once THEN the listener unloads itself after its first run", async () => {
    const client = createClient();
    const received: string[] = [];

    @RegisterAsGatewayListener("userUpdate", { once: true })
    class UserUpdateListener extends EventGatewayListener<"userUpdate"> {
      public override run(_previous: User | null, current: User) {
        received.push(current.username);
      }
    }

    const store = container.stores.get("listeners");
    await store.insert(new UserUpdateListener(context("once"), {} as never));

    await sendUserUpdate(client, "first");
    await sendUserUpdate(client, "second");

    expect(received).toEqual(["first"]);
    expect(store.has("once")).toBe(false);
  });
});

describe("RegisterAsDispatchListener", () => {
  afterEach(async () => {
    await container.stores.get("listeners").unloadAll();
  });

  function decorated(received: string[], options: { once?: boolean } = {}) {
    @RegisterAsDispatchListener("userUpdate", options)
    class UserUpdateListener extends EventGatewayListener<"userUpdate"> {
      public override run(_previous: User | null, current: User) {
        received.push(current.username);
      }
    }
    return new UserUpdateListener(context("dispatch"), {} as never);
  }

  test("GIVEN a client that does not forward THEN the listener runs", async () => {
    const client = createClient();
    const received: string[] = [];
    const listener = decorated(received);

    expect(listener.emitter).toBe(client);
    expect(listener.event).toBe("userUpdate");

    await container.stores.get("listeners").insert(listener);
    await sendUserUpdate(client, "standalone");

    expect(received).toEqual(["standalone"]);
  });

  test("GIVEN a client that forwards THEN the listener stays idle until forwarding stops", async () => {
    const client = createClient();
    const received: string[] = [];
    await container.stores.get("listeners").insert(decorated(received));

    const unmark = client.markDispatchesForwarded();
    expect(client.forwardsDispatches).toBe(true);
    await sendUserUpdate(client, "forwarded");
    expect(received).toEqual([]);

    unmark();
    expect(client.forwardsDispatches).toBe(false);
    await sendUserUpdate(client, "again");
    expect(received).toEqual(["again"]);
  });

  test("GIVEN forwarding that starts before the listener loads THEN the listener stays idle", async () => {
    const client = createClient();
    const received: string[] = [];
    client.markDispatchesForwarded();

    await container.stores.get("listeners").insert(decorated(received));
    await sendUserUpdate(client, "forwarded");

    expect(received).toEqual([]);
  });

  test("GIVEN several forwarders THEN the client forwards until the last stops", () => {
    const client = createClient();
    const first = client.markDispatchesForwarded();
    const second = client.markDispatchesForwarded();

    first();
    first();
    expect(client.forwardsDispatches).toBe(true);
    second();
    expect(client.forwardsDispatches).toBe(false);
  });

  test("GIVEN once THEN an idle listener is not spent", async () => {
    const client = createClient();
    const received: string[] = [];
    const store = container.stores.get("listeners");
    await store.insert(decorated(received, { once: true }));

    const unmark = client.markDispatchesForwarded();
    await sendUserUpdate(client, "idle");
    expect(store.has("dispatch")).toBe(true);

    unmark();
    await sendUserUpdate(client, "first");
    await sendUserUpdate(client, "second");

    expect(received).toEqual(["first"]);
    expect(store.has("dispatch")).toBe(false);
  });

  test.each([...gatewayOnlyEvents])("GIVEN the gateway-only %s event THEN it throws", (event) => {
    expect(() => RegisterAsDispatchListener(event as never)).toThrow(TypeError);
  });

  test("GIVEN the gateway-only events THEN they are events of the client, and raw is not one", () => {
    const events = new Set<string>(Object.values(GatewayEvents));
    for (const event of gatewayOnlyEvents) expect(events.has(event)).toBe(true);
    expect(gatewayOnlyEvents.has("raw")).toBe(false);
  });
});
