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
  RegisterAsGatewayListener,
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
