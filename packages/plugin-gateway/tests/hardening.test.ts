import { WebSocketShardEvents } from "@discordjs/ws";
import { container } from "@wolfstar/http-framework";
import { createInMemoryCache, type Cache } from "@wolfstar/plugin-cache";
import {
  ChannelType,
  GatewayDispatchEvents,
  GatewayOpcodes,
  type APIUser,
  type GatewayDispatchPayload,
} from "discord-api-types/v10";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  dispatchPartition,
  DispatchQueue,
  DispatchTimeoutError,
  GatewayClient,
  type GatewayClientOptions,
  type GatewayEventMap,
  type GatewayEventName,
} from "../src/index.js";

const user: APIUser = {
  id: "266624760782258186",
  username: "wolf",
  discriminator: "0",
  global_name: null,
  avatar: null,
};

function createClient(cache: Cache | null, options: Partial<GatewayClientOptions> = {}) {
  return new GatewayClient({
    discordPublicKey: "0".repeat(64),
    discordToken: "test-token",
    clientId: "266624760782258186",
    intents: 0,
    cache: cache ?? undefined,
    ...options,
  });
}

function payload(t: GatewayDispatchEvents, d: unknown): GatewayDispatchPayload {
  return { op: GatewayOpcodes.Dispatch, s: 1, t, d } as GatewayDispatchPayload;
}

function send(client: GatewayClient, t: GatewayDispatchEvents, d: unknown, shardId = 0) {
  client.gateway.emit(WebSocketShardEvents.Dispatch, payload(t, d), shardId);
}

function record<Event extends GatewayEventName>(client: GatewayClient, event: Event) {
  const calls: GatewayEventMap[Event][] = [];
  client.on(event, (...args: any[]) => {
    calls.push(args as GatewayEventMap[Event]);
  });
  return calls;
}

function message(id: string, channelId: string, guildId: string, content: string) {
  return {
    id,
    channel_id: channelId,
    guild_id: guildId,
    author: user,
    content,
    mentions: [],
    mention_roles: [],
    attachments: [],
    embeds: [],
    timestamp: "2024-01-01T00:00:00.000Z",
    edited_timestamp: null,
    type: 0,
  };
}

function guild(id: string) {
  return {
    id,
    name: `Guild ${id}`,
    roles: [],
    emojis: [],
    stickers: [],
    features: [],
    channels: [],
    threads: [],
    members: [],
    presences: [],
    voice_states: [],
    stage_instances: [],
    guild_scheduled_events: [],
    soundboard_sounds: [],
  };
}

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

describe("dispatchPartition", () => {
  test("GIVEN guild, DM, and user-level dispatches THEN they map to guild, channel, and barrier", () => {
    expect(
      dispatchPartition(payload(GatewayDispatchEvents.MessageCreate, message("1", "2", "3", ""))),
    ).toBe("guild:3");
    expect(dispatchPartition(payload(GatewayDispatchEvents.GuildCreate, guild("7")))).toBe(
      "guild:7",
    );
    expect(dispatchPartition(payload(GatewayDispatchEvents.GuildDelete, { id: "7" }))).toBe(
      "guild:7",
    );
    expect(
      dispatchPartition(payload(GatewayDispatchEvents.MessageCreate, { id: "1", channel_id: "9" })),
    ).toBe("channel:9");
    expect(
      dispatchPartition(
        payload(GatewayDispatchEvents.ChannelCreate, { id: "9", type: ChannelType.DM }),
      ),
    ).toBe("channel:9");
    expect(
      dispatchPartition(payload(GatewayDispatchEvents.Ready, { user, guilds: [] })),
    ).toBeNull();
    expect(dispatchPartition(payload(GatewayDispatchEvents.UserUpdate, user))).toBeNull();
  });
});

describe("DispatchQueue", () => {
  test("GIVEN a task of the client for a guild THEN it runs after the guild's dispatches, on their shard", async () => {
    const queue = new DispatchQueue();
    const order: string[] = [];
    let release!: () => void;

    void queue.enqueue(3, "guild:a", async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      order.push("dispatch");
    });
    const task = queue.enqueueGuild("a", async () => {
      order.push("client");
    });
    await Promise.resolve();
    expect(order).toEqual([]);
    release();
    await task;

    expect(order).toEqual(["dispatch", "client"]);
  });

  test("GIVEN one partition THEN tasks run in order, and other partitions run concurrently", async () => {
    const queue = new DispatchQueue();
    const order: string[] = [];

    void queue.enqueue(0, "guild:a", async () => {
      await delay(30);
      order.push("a1");
    });
    void queue.enqueue(0, "guild:a", async () => {
      order.push("a2");
    });
    void queue.enqueue(0, "guild:b", async () => {
      order.push("b1");
    });

    expect(queue.stats).toEqual({ pending: 3, partitions: 2 });
    await queue.idle();

    // b1 did not wait for the slow a1, a2 did.
    expect(order).toEqual(["b1", "a1", "a2"]);
    expect(queue.stats).toEqual({ pending: 0, partitions: 0 });
  });

  test("GIVEN a barrier THEN it waits for every partition, and later tasks wait for it", async () => {
    const queue = new DispatchQueue();
    const order: string[] = [];

    void queue.enqueue(0, "guild:a", async () => {
      await delay(20);
      order.push("a");
    });
    void queue.enqueue(0, null, async () => {
      order.push("barrier");
    });
    void queue.enqueue(0, "guild:b", async () => {
      order.push("b");
    });
    void queue.enqueue(1, "guild:c", async () => {
      order.push("other shard");
    });

    await queue.idle();

    expect(order).toEqual(["other shard", "a", "barrier", "b"]);
  });
});

describe("GatewayClient dispatch hardening", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  test("GIVEN a slow guild THEN another guild's events are not held back, and each guild stays ordered", async () => {
    const cache = createInMemoryCache();
    const set = cache.messages.set.bind(cache.messages);
    vi.spyOn(cache.messages, "set").mockImplementation(async (key, value) => {
      if (key.startsWith("slow")) await delay(40);
      set(key, value);
    });
    const client = createClient(cache);
    const created = record(client, "messageCreate");

    send(client, GatewayDispatchEvents.MessageCreate, message("1", "slow", "10", "slow first"));
    send(client, GatewayDispatchEvents.MessageCreate, message("2", "slow", "10", "slow second"));
    send(client, GatewayDispatchEvents.MessageCreate, message("3", "fast", "11", "fast"));
    await client.idle();

    expect(created.map(([emitted]) => emitted.content)).toEqual([
      "fast",
      "slow first",
      "slow second",
    ]);
    expect(client.queueStats).toEqual({ pending: 0, partitions: 0 });
  });

  test("GIVEN a dispatch slower than dispatchTimeout THEN a DispatchTimeoutError is reported and the event still emitted", async () => {
    const cache = createInMemoryCache();
    const set = cache.messages.set.bind(cache.messages);
    vi.spyOn(cache.messages, "set").mockImplementation(async (key, value) => {
      await delay(60);
      set(key, value);
    });
    const client = createClient(cache, { dispatchTimeout: 10 });
    const errors = record(client, "error");
    const created = record(client, "messageCreate");

    send(client, GatewayDispatchEvents.MessageCreate, message("1", "20", "10", "late"));
    await client.idle();

    expect(errors).toHaveLength(1);
    const [[error]] = errors;
    expect(error).toBeInstanceOf(DispatchTimeoutError);
    expect(error).toMatchObject({ type: "MESSAGE_CREATE", partition: "guild:10", timeout: 10 });
    expect(created).toHaveLength(1);
  });

  test("GIVEN cacheFailure skip THEN a failing cache drops the event", async () => {
    const cache = createInMemoryCache();
    vi.spyOn(cache.messages, "set").mockRejectedValue(new Error("down"));
    const client = createClient(cache);
    const errors = record(client, "error");
    const created = record(client, "messageCreate");

    send(client, GatewayDispatchEvents.MessageCreate, message("1", "20", "10", "lost"));
    await client.idle();

    expect(errors).toHaveLength(1);
    expect(created).toHaveLength(0);
  });

  test("GIVEN cacheFailure emitUncached THEN the event is still emitted, built from the payload", async () => {
    const cache = createInMemoryCache();
    vi.spyOn(cache.guilds, "get").mockRejectedValue(new Error("down"));
    vi.spyOn(cache.guilds, "set").mockRejectedValue(new Error("down"));
    const client = createClient(cache, { cacheFailure: "emitUncached" });
    const errors = record(client, "error");
    const updated = record(client, "guildUpdate");
    const created = record(client, "guildCreate");

    send(client, GatewayDispatchEvents.GuildCreate, guild("10"));
    send(client, GatewayDispatchEvents.GuildUpdate, { ...guild("10"), name: "Renamed" });
    await client.idle();

    expect(errors.length).toBeGreaterThanOrEqual(2);
    expect(created[0]![0].name).toBe("Guild 10");
    expect(updated[0]![0]).toBeNull();
    expect(updated[0]![1].name).toBe("Renamed");
  });
});

describe("CachedManager fetch options", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("GIVEN force THEN the API is hit even on a cache hit, and the cache is refreshed", async () => {
    const client = createClient(createInMemoryCache());
    await client.cache!.users.set(user.id, user);
    const get = vi.spyOn(container.rest, "get").mockResolvedValue({ ...user, username: "renamed" });

    const fetched = await client.users.fetch(user.id, { force: true });

    expect(get).toHaveBeenCalledOnce();
    expect(fetched.username).toBe("renamed");
    expect((await client.users.get(user.id))?.username).toBe("renamed");
  });

  test("GIVEN cache false THEN the fetched entity is not stored", async () => {
    const client = createClient(createInMemoryCache());
    vi.spyOn(container.rest, "get").mockResolvedValue(user);

    await client.users.fetch(user.id, { cache: false });

    expect(await client.users.get(user.id)).toBeUndefined();
  });

  test("GIVEN a two-key manager THEN options still come after both keys", async () => {
    const client = createClient(createInMemoryCache());
    const get = vi.spyOn(container.rest, "get").mockResolvedValue(message("30", "20", "10", "hi"));

    await client.messages.fetch("20", "30");
    await client.messages.fetch("20", "30");
    await client.messages.fetch("20", "30", { force: true });

    expect(get).toHaveBeenCalledTimes(2);
  });
});

describe("READY reconciliation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Guild "10" and "11" land on shard 0 of 2 (`(id >> 22) % 2`), guild `4194304` (`1 << 22`) on shard 1.
  const otherShardGuild = String(1 << 22);

  test("GIVEN cached guilds READY no longer lists THEN they are dropped and guildDelete is emitted", async () => {
    const client = createClient(createInMemoryCache(), { shardCount: 2 });
    const deleted = record(client, "guildDelete");

    send(client, GatewayDispatchEvents.GuildCreate, guild("10"));
    send(client, GatewayDispatchEvents.GuildCreate, guild("11"));
    send(client, GatewayDispatchEvents.GuildCreate, guild(otherShardGuild), 1);
    send(client, GatewayDispatchEvents.Ready, {
      user,
      guilds: [{ id: "10", unavailable: true }],
      session_id: "s",
    });
    await client.idle();

    expect(deleted).toHaveLength(1);
    expect(deleted[0]![0]?.name).toBe("Guild 11");
    expect(deleted[0]![1]).toEqual({ id: "11" });
    expect(await client.guilds.get("11")).toBeUndefined();
    expect(await client.guilds.get("10")).toBeDefined();
    // Another shard's guild is never touched by this shard's READY.
    expect(await client.guilds.get(otherShardGuild)).toBeDefined();
  });

  test("GIVEN an unreachable cache THEN READY is still emitted under the default skip policy", async () => {
    const cache = createInMemoryCache();
    await cache.guilds.set("11", guild("11") as never);
    vi.spyOn(cache.guilds, "keys").mockRejectedValue(new Error("down"));
    vi.spyOn(cache.users, "set").mockRejectedValue(new Error("down"));
    const client = createClient(cache, { shardCount: 1 });
    const errors = record(client, "error");
    const ready = record(client, "shardReady");

    send(client, GatewayDispatchEvents.Ready, { user, guilds: [], session_id: "s" });
    await client.idle();

    expect(ready).toHaveLength(1);
    expect(client.user?.id).toBe(user.id);
    // One for the reconciliation, one for writing READY itself.
    expect(errors).toHaveLength(2);
  });

  test("GIVEN an unknown shard count THEN READY is still processed and the guilds are kept", async () => {
    const client = createClient(createInMemoryCache());
    vi.spyOn(client.gateway, "getShardCount").mockRejectedValue(new Error("401: Unauthorized"));
    const errors = record(client, "error");
    const ready = record(client, "shardReady");

    send(client, GatewayDispatchEvents.GuildCreate, guild("11"));
    send(client, GatewayDispatchEvents.Ready, { user, guilds: [], session_id: "s" });
    await client.idle();

    expect(ready).toHaveLength(1);
    expect(client.user?.id).toBe(user.id);
    expect(errors).toHaveLength(1);
    expect(await client.guilds.get("11")).toBeDefined();
  });
});
