import { CloseCodes, type SessionInfo } from "@discordjs/ws";
import {
  createRedisSessionStore,
  type GatewaySessionInfo,
  type GatewaySessionStore,
} from "@wolfstar/plugin-cache";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  GatewayClient,
  GatewaySessionStoreError,
  type GatewayClientOptions,
} from "../src/index.js";
import { FakeRedis } from "../../../tests/fixtures/FakeRedis.js";

const session: SessionInfo = {
  resumeURL: "wss://gateway-us-east1-b.discord.gg",
  sequence: 1,
  sessionId: "a1b2c3",
  shardCount: 1,
  shardId: 0,
};

function createClient(options: Partial<GatewayClientOptions> = {}) {
  return new GatewayClient({
    discordPublicKey: "0".repeat(64),
    discordToken: "test-token",
    clientId: "266624760782258186",
    intents: 0,
    ...options,
  });
}

/** A store keeping the sessions in a `Map`, recording its calls. */
function createStore(sessions = new Map<number, GatewaySessionInfo>()) {
  return {
    sessions,
    get: vi.fn(async (shardId: number) => sessions.get(shardId) ?? null),
    set: vi.fn(async (shardId: number, info: GatewaySessionInfo | null) => {
      if (info) sessions.set(shardId, info);
      else sessions.delete(shardId);
    }),
  } satisfies GatewaySessionStore & { sessions: Map<number, GatewaySessionInfo> };
}

// `@discordjs/ws` reads and writes the sessions through the manager's options.
function retrieve(client: GatewayClient, shardId = 0) {
  return client.gateway.options.retrieveSessionInfo(shardId);
}

function update(client: GatewayClient, info: SessionInfo | null, shardId = 0) {
  return client.gateway.options.updateSessionInfo(shardId, info);
}

// Like `@discordjs/ws`, which drops the session of every shard destroyed without resuming.
function mockDestroy(client: GatewayClient) {
  return vi.spyOn(client.gateway, "destroy").mockImplementation(async () => {
    await update(client, null);
  });
}

describe("GatewayClient sessionStore", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("GIVEN a stored session THEN it is read once, then served from memory", async () => {
    const store = createStore(new Map([[0, session]]));
    const client = createClient({ sessionStore: store });

    expect(await retrieve(client)).toEqual(session);
    expect(await retrieve(client)).toEqual(session);
    expect(await retrieve(client, 1)).toBeNull();
    expect(store.get).toHaveBeenCalledTimes(2);
  });

  test("GIVEN session updates THEN they are served at once and written in the background", async () => {
    const store = createStore();
    const client = createClient({ sessionStore: store });

    expect(update(client, session)).toBeUndefined();
    expect(await retrieve(client)).toEqual(session);
    expect(store.get).not.toHaveBeenCalled();

    await client.destroy();
    expect(store.sessions.get(0)).toEqual(session);
  });

  test("GIVEN updates while a write is in flight THEN they collapse into one write of the latest", async () => {
    const store = createStore();
    let release!: () => void;
    store.set.mockImplementationOnce(() => new Promise<void>((resolve) => (release = resolve)));
    const client = createClient({ sessionStore: store });

    update(client, session);
    await vi.waitFor(() => expect(store.set).toHaveBeenCalledTimes(1));
    for (let sequence = 2; sequence <= 5; sequence++) update(client, { ...session, sequence });
    release();
    await client.destroy();

    expect(store.set.mock.calls.map(([, info]) => info?.sequence)).toEqual([1, 5]);
    expect(store.sessions.get(0)?.sequence).toBe(5);
  });

  test("GIVEN a failing get THEN the error is emitted and the shard identifies", async () => {
    const store = createStore();
    const outage = new Error("ECONNREFUSED");
    store.get.mockRejectedValue(outage);
    const client = createClient({ sessionStore: store });
    const errors: unknown[] = [];
    client.on("error", (error) => errors.push(error));

    expect(await retrieve(client)).toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(GatewaySessionStoreError);
    expect(errors[0]).toMatchObject({ operation: "get", shardId: 0, cause: outage });
  });

  test("GIVEN a hanging get THEN the shard identifies after sessionStoreTimeout", async () => {
    vi.useFakeTimers();
    const store = createStore();
    store.get.mockReturnValue(new Promise(() => {}));
    const client = createClient({ sessionStore: store, sessionStoreTimeout: 1_000 });
    const logged = vi.spyOn(client.logger, "error").mockImplementation(() => {});

    const retrieved = retrieve(client);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(await retrieved).toBeNull();
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining("Cannot read the session of shard 0"),
      expect.objectContaining({ message: "Timed out after 1000ms" }),
    );
  });

  test("GIVEN a failing set THEN the error is emitted and later writes still run", async () => {
    const store = createStore();
    store.set.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const client = createClient({ sessionStore: store });
    const errors: unknown[] = [];
    client.on("error", (error) => errors.push(error));

    update(client, session);
    await client.destroy();
    update(client, { ...session, sequence: 2 });
    await client.destroy();

    expect(errors).toEqual([expect.objectContaining({ operation: "set", shardId: 0 })]);
    expect(store.sessions.get(0)?.sequence).toBe(2);
  });

  test("GIVEN gateway session callbacks too THEN the constructor throws", () => {
    const store = createStore();

    expect(() =>
      createClient({ sessionStore: store, gateway: { retrieveSessionInfo: () => null } }),
    ).toThrow(TypeError);
    expect(() =>
      createClient({ sessionStore: store, gateway: { updateSessionInfo: () => {} } }),
    ).toThrow(TypeError);
  });

  test("GIVEN a Redis session store THEN the sessions reach Redis", async () => {
    const redis = new FakeRedis();
    const client = createClient({ sessionStore: createRedisSessionStore({ redis }) });

    update(client, session);
    await client.destroy();

    expect(JSON.parse(redis.strings.get("wolfstar:sessions:0")!.value)).toEqual(session);
  });
});

describe("GatewayClient#destroy", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("GIVEN no options THEN the sessions are closed and dropped", async () => {
    const store = createStore();
    const client = createClient({ sessionStore: store });
    const destroy = mockDestroy(client);

    update(client, session);
    await client.destroy();

    expect(destroy).toHaveBeenCalledWith({});
    expect(store.sessions.has(0)).toBe(false);
    expect(await retrieve(client)).toBeNull();
  });

  test("GIVEN resumable THEN the shards close with a resumable code and keep their sessions", async () => {
    const store = createStore();
    const client = createClient({ sessionStore: store });
    const destroy = mockDestroy(client);

    update(client, session);
    await client.destroy({ resumable: true });

    expect(destroy).toHaveBeenCalledWith(expect.objectContaining({ code: CloseCodes.Resuming }));
    expect(store.sessions.get(0)).toEqual(session);
    expect(await retrieve(client)).toEqual(session);

    // Only the resumable shutdown keeps them.
    await client.destroy();
    expect(store.sessions.has(0)).toBe(false);
  });

  test("GIVEN resumable with gateway.updateSessionInfo THEN it is not told to drop the sessions", async () => {
    const updateSessionInfo = vi.fn();
    const client = createClient({ gateway: { updateSessionInfo } });
    mockDestroy(client);

    await update(client, session);
    await client.destroy({ resumable: true });

    expect(updateSessionInfo.mock.calls).toEqual([[0, session]]);
  });
});
