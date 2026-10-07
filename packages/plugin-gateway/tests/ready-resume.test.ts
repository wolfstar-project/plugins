import { WebSocketShardEvents, WebSocketShardStatus } from "@discordjs/ws";
import { createInMemoryCache } from "@wolfstar/plugin-cache";
import {
  GatewayDispatchEvents,
  GatewayIntentBits,
  GatewayOpcodes,
  type GatewayDispatchPayload,
} from "discord-api-types/v10";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  ClientUser,
  GatewayClient,
  GatewayEvents,
  type GatewayClientOptions,
} from "../src/index.js";

const user = {
  id: "266624760782258186",
  username: "wolf",
  discriminator: "0",
  global_name: "Wolf",
  avatar: null,
};

function createClient(options: Partial<GatewayClientOptions> = {}) {
  return new GatewayClient({
    discordPublicKey: "0".repeat(64),
    discordToken: "test-token",
    clientId: user.id,
    intents: GatewayIntentBits.Guilds,
    cache: createInMemoryCache(),
    ...options,
  });
}

function mockStatuses(client: GatewayClient, statuses: WebSocketShardStatus[]) {
  const map = () => new Map(statuses.map((status, shardId) => [shardId, status]));
  return {
    spy: vi.spyOn(client.gateway, "fetchStatus").mockImplementation(async () => map() as never),
    set: (shardId: number, status: WebSocketShardStatus) => void (statuses[shardId] = status),
  };
}

// Emits the `resumed` event of a shard, then lets the ready check it starts settle.
async function resume(client: GatewayClient, shardId = 0) {
  client.gateway.emit(WebSocketShardEvents.Resumed, shardId);
  await vi.waitFor(() => expect(settled(client)).toBe(true));
}

// `#readyAfterResume` is not awaited by anything the client exposes: wait until the user restore had its chance.
function settled(client: GatewayClient) {
  return client.user !== null || client.isClientReady();
}

async function dispatch(client: GatewayClient, t: GatewayDispatchEvents, d: unknown, shardId = 0) {
  const payload = { op: GatewayOpcodes.Dispatch, s: 1, t, d } as GatewayDispatchPayload;
  client.gateway.emit(WebSocketShardEvents.Dispatch, payload, shardId);
  await client.idle();
}

function readyData(guilds: readonly { id: string; unavailable?: boolean }[] = []) {
  return { user, guilds, session_id: "s" };
}

function listen(client: GatewayClient) {
  const ready: unknown[][] = [];
  const errors: unknown[] = [];
  client.on(GatewayEvents.ClientReady, (...args) => ready.push(args));
  client.on("error", (error) => errors.push(error));
  return { ready, errors };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GatewayClient after resuming a stored session", () => {
  test("GIVEN a single shard that only resumes THEN the client becomes ready with the user from the REST API", async () => {
    const client = createClient();
    mockStatuses(client, [WebSocketShardStatus.Ready]);
    const getCurrent = vi.spyOn(client.api.users, "getCurrent").mockResolvedValue(user as never);
    const { ready, errors } = listen(client);

    await resume(client);

    expect(ready).toEqual([[client]]);
    expect(client.isClientReady()).toBe(true);
    expect(client.user).toBeInstanceOf(ClientUser);
    expect(client.user?.id).toBe(user.id);
    expect(getCurrent).toHaveBeenCalledOnce();
    expect(errors).toEqual([]);
  });

  test("GIVEN the user in the cache THEN it is restored from it without calling the API", async () => {
    const cache = createInMemoryCache();
    await cache.users.set(user.id, user as never);
    const client = createClient({ cache });
    mockStatuses(client, [WebSocketShardStatus.Ready]);
    const getCurrent = vi.spyOn(client.api.users, "getCurrent");
    const { ready } = listen(client);

    await resume(client);

    expect(client.user?.username).toBe("wolf");
    expect(ready).toHaveLength(1);
    expect(getCurrent).not.toHaveBeenCalled();
  });

  test("GIVEN a failing REST API THEN the error is reported and clientReady still fires with no user", async () => {
    const client = createClient();
    mockStatuses(client, [WebSocketShardStatus.Ready]);
    const failure = new Error("boom");
    vi.spyOn(client.api.users, "getCurrent").mockRejectedValue(failure);
    const { ready, errors } = listen(client);

    await resume(client);

    expect(errors).toEqual([failure]);
    expect(ready).toHaveLength(1);
    expect(client.isClientReady()).toBe(true);
    expect(client.user).toBeNull();
  });

  test("GIVEN every shard resuming THEN clientReady waits for the last one, and fires once", async () => {
    const client = createClient();
    const statuses = mockStatuses(client, [
      WebSocketShardStatus.Ready,
      WebSocketShardStatus.Resuming,
    ]);
    const getCurrent = vi.spyOn(client.api.users, "getCurrent").mockResolvedValue(user as never);
    const { ready } = listen(client);

    client.gateway.emit(WebSocketShardEvents.Resumed, 0);
    await vi.waitFor(() => expect(client.user).not.toBeNull());
    expect(ready).toHaveLength(0);

    statuses.set(1, WebSocketShardStatus.Ready);
    client.gateway.emit(WebSocketShardEvents.Resumed, 1);
    await vi.waitFor(() => expect(ready).toHaveLength(1));

    expect(getCurrent).toHaveBeenCalledOnce();
  });

  test("GIVEN shards resuming at once THEN the user is fetched a single time", async () => {
    const client = createClient();
    mockStatuses(client, [WebSocketShardStatus.Ready, WebSocketShardStatus.Ready]);
    const getCurrent = vi.spyOn(client.api.users, "getCurrent").mockResolvedValue(user as never);
    const { ready } = listen(client);

    client.gateway.emit(WebSocketShardEvents.Resumed, 0);
    client.gateway.emit(WebSocketShardEvents.Resumed, 1);
    await vi.waitFor(() => expect(client.isClientReady()).toBe(true));

    expect(getCurrent).toHaveBeenCalledOnce();
    expect(ready).toHaveLength(1);
  });

  test("GIVEN one shard resuming and another identifying THEN the guilds of READY are still awaited", async () => {
    const client = createClient();
    mockStatuses(client, [WebSocketShardStatus.Ready, WebSocketShardStatus.Ready]);
    vi.spyOn(client.api.users, "getCurrent").mockResolvedValue(user as never);
    const { ready } = listen(client);

    await dispatch(
      client,
      GatewayDispatchEvents.Ready,
      readyData([{ id: "10", unavailable: true }]),
      1,
    );
    client.gateway.emit(WebSocketShardEvents.Resumed, 0);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(ready).toHaveLength(0);

    await dispatch(
      client,
      GatewayDispatchEvents.GuildCreate,
      {
        id: "10",
        name: "Pack",
        channels: [],
        threads: [],
        members: [],
        presences: [],
        voice_states: [],
        stage_instances: [],
        guild_scheduled_events: [],
        soundboard_sounds: [],
      },
      1,
    );

    expect(ready).toHaveLength(1);
  });

  test("GIVEN a resume after READY THEN it does not fetch the user nor emit clientReady again", async () => {
    const client = createClient();
    mockStatuses(client, [WebSocketShardStatus.Ready]);
    const getCurrent = vi.spyOn(client.api.users, "getCurrent");
    const { ready } = listen(client);

    await dispatch(client, GatewayDispatchEvents.Ready, readyData());
    expect(ready).toHaveLength(1);

    client.gateway.emit(WebSocketShardEvents.Resumed, 0);
    await client.idle();

    expect(ready).toHaveLength(1);
    expect(getCurrent).not.toHaveBeenCalled();
  });
});
