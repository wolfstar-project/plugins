import { AsyncLocalStorage } from "node:async_hooks";
import { WebSocketShardEvents } from "@discordjs/ws";
import { createInMemoryCache } from "@wolfstar/plugin-cache";
import {
  GatewayDispatchEvents,
  GatewayOpcodes,
  type APIUser,
  type GatewayDispatchPayload,
} from "discord-api-types/v10";
import { afterEach, describe, expect, test, vi } from "vitest";
import { GatewayClient, type WrappedDispatch } from "../src/index.js";

const user: APIUser = {
  id: "266624760782258186",
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
    cache: createInMemoryCache(),
  });
}

function send(client: GatewayClient, id: string, shardId = 0) {
  const payload = {
    op: GatewayOpcodes.Dispatch,
    s: 1,
    t: GatewayDispatchEvents.MessageCreate,
    d: {
      id,
      channel_id: "20",
      guild_id: "10",
      author: user,
      content: id,
      mentions: [],
      mention_roles: [],
      attachments: [],
      embeds: [],
      timestamp: "2024-01-01T00:00:00.000Z",
      edited_timestamp: null,
      type: 0,
    },
  } as GatewayDispatchPayload;
  client.gateway.emit(WebSocketShardEvents.Dispatch, payload, shardId);
}

function collectErrors(client: GatewayClient) {
  const errors: unknown[] = [];
  client.on("error", (error) => errors.push(error));
  return errors;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GatewayClient#addDispatchWrapper", () => {
  test("GIVEN wrappers THEN they nest, the first added outermost, around the processing of the dispatch", async () => {
    const client = createClient();
    const calls: string[] = [];
    const seen: WrappedDispatch[] = [];
    client.addDispatchWrapper(async (dispatch, run) => {
      seen.push(dispatch);
      calls.push("outer:start");
      await run();
      calls.push("outer:end");
    });
    client.addDispatchWrapper(async (_dispatch, run) => {
      calls.push("inner:start");
      await run();
      calls.push("inner:end");
    });
    client.on("messageCreate", () => calls.push("messageCreate"));

    send(client, "1", 3);
    await client.idle();

    expect(calls).toEqual([
      "outer:start",
      "inner:start",
      "messageCreate",
      "inner:end",
      "outer:end",
    ]);
    expect(seen).toEqual([
      {
        payload: expect.objectContaining({ t: GatewayDispatchEvents.MessageCreate }),
        shardId: 3,
        partition: "guild:10",
      },
    ]);
  });

  test("GIVEN a wrapper that enters an AsyncLocalStorage THEN the listeners of the dispatch run in its store", async () => {
    const client = createClient();
    const storage = new AsyncLocalStorage<string>();
    client.addDispatchWrapper((dispatch, run) => storage.run(`shard ${dispatch.shardId}`, run));
    const stores: (string | undefined)[] = [];
    client.on("messageCreate", () => stores.push(storage.getStore()));

    send(client, "1", 2);
    await client.idle();

    expect(stores).toEqual(["shard 2"]);
  });

  test("GIVEN a failing dispatch THEN run rejects in the wrapper and the client still reports it", async () => {
    const client = createClient();
    const failure = new Error("listener failed");
    vi.spyOn(client.cache!.messages!, "upsert").mockRejectedValue(failure);
    const errors = collectErrors(client);
    const rejections: unknown[] = [];
    client.addDispatchWrapper(async (_dispatch, run) => {
      try {
        await run();
      } catch (error) {
        rejections.push(error);
        throw error;
      }
    });

    send(client, "1");
    await client.idle();

    expect(rejections).toHaveLength(1);
    expect(errors).toHaveLength(1);
  });

  test("GIVEN a removed wrapper THEN the next dispatches skip it", async () => {
    const client = createClient();
    const wrapper = vi.fn((_dispatch: WrappedDispatch, run: () => Promise<void>) => run());
    const remove = client.addDispatchWrapper(wrapper);

    send(client, "1");
    await client.idle();
    remove();
    send(client, "2");
    await client.idle();

    expect(wrapper).toHaveBeenCalledTimes(1);
  });
});

describe("GatewayClient#addDestroyHook", () => {
  test("GIVEN hooks THEN they run in order once the shards are disconnected and the dispatches processed", async () => {
    const client = createClient();
    const calls: string[] = [];
    vi.spyOn(client.gateway, "destroy").mockImplementation(async () => {
      calls.push("gateway.destroy");
    });
    vi.spyOn(client, "idle").mockImplementation(async () => {
      calls.push("idle");
    });
    client.addDestroyHook(() => calls.push("first"));
    client.addDestroyHook(async () => {
      calls.push("second");
    });

    await client.destroy();

    expect(calls).toEqual(["gateway.destroy", "idle", "first", "second"]);
  });

  test("GIVEN a gateway that fails to disconnect THEN the hooks still run and destroy rejects", async () => {
    const client = createClient();
    const failure = new Error("close failed");
    vi.spyOn(client.gateway, "destroy").mockRejectedValue(failure);
    const hook = vi.fn();
    client.addDestroyHook(hook);

    await expect(client.destroy()).rejects.toBe(failure);
    expect(hook).toHaveBeenCalledTimes(1);
  });

  test("GIVEN a failing hook THEN it is reported and the next hooks still run", async () => {
    const client = createClient();
    vi.spyOn(client.gateway, "destroy").mockResolvedValue();
    const errors = collectErrors(client);
    const failure = new Error("flush failed");
    const next = vi.fn();
    client.addDestroyHook(() => {
      throw failure;
    });
    client.addDestroyHook(next);

    await client.destroy();

    expect(errors).toEqual([failure]);
    expect(next).toHaveBeenCalledTimes(1);
  });

  test("GIVEN a removed hook THEN destroy does not run it", async () => {
    const client = createClient();
    vi.spyOn(client.gateway, "destroy").mockResolvedValue();
    const hook = vi.fn();
    client.addDestroyHook(hook)();

    await client.destroy();

    expect(hook).not.toHaveBeenCalled();
  });
});
