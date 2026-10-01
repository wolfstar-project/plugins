import { WebSocketShardEvents } from "@discordjs/ws";
import { createInMemoryCache, type Cache } from "@wolfstar/plugin-cache";
import {
  GatewayDispatchEvents,
  GatewayOpcodes,
  type APIGuildMember,
  type APIUser,
  type GatewayDispatchPayload,
  type GatewayRequestGuildMembers,
} from "discord-api-types/v10";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  GatewayClient,
  Guild,
  GuildMember,
  GuildMembersRateLimitError,
  GuildMembersTimeoutError,
  type GatewayEventMap,
  type GatewayEventName,
} from "../src/index.js";

const guildId = "10";
// Guild "10" lands on shard 0 of 2 (`(id >> 22) % 2`), guild `4194304` (`1 << 22`) on shard 1.
const otherShardGuild = String(1 << 22);

function user(id: string): APIUser {
  return { id, username: `user ${id}`, discriminator: "0", global_name: null, avatar: null };
}

function member(id: string): APIGuildMember {
  return {
    user: user(id),
    roles: [],
    joined_at: "2024-01-01T00:00:00.000Z",
    deaf: false,
    mute: false,
    flags: 0,
  };
}

function createClient(cache: Cache | null = createInMemoryCache()) {
  const client = new GatewayClient({
    discordPublicKey: "0".repeat(64),
    discordToken: "test-token",
    clientId: "266624760782258186",
    intents: 0,
    cache,
  });
  vi.spyOn(client.gateway, "getShardCount").mockResolvedValue(2);
  const send = vi.spyOn(client.gateway, "send").mockResolvedValue();
  return { client, send };
}

async function dispatch(client: GatewayClient, t: GatewayDispatchEvents, d: unknown, shardId = 0) {
  const payload = { op: GatewayOpcodes.Dispatch, s: 1, t, d } as GatewayDispatchPayload;
  client.gateway.emit(WebSocketShardEvents.Dispatch, payload, shardId);
  await client.idle();
}

function chunk(nonce: string, index: number, count: number, ids: string[], extra = {}) {
  return {
    guild_id: guildId,
    members: ids.map(member),
    chunk_index: index,
    chunk_count: count,
    nonce,
    ...extra,
  };
}

function record<Event extends GatewayEventName>(client: GatewayClient, event: Event) {
  const calls: GatewayEventMap[Event][] = [];
  client.on(event, (...args: any[]) => {
    calls.push(args as GatewayEventMap[Event]);
  });
  return calls;
}

// Lets `request` send its payload and arm its timeout, then gets the nonce it sent.
async function sent(send: ReturnType<typeof createClient>["send"], calls = 1) {
  await new Promise(setImmediate);
  expect(send).toHaveBeenCalledTimes(calls);
  return (send.mock.calls[calls - 1]![1] as GatewayRequestGuildMembers).d.nonce!;
}

// Tracks whether a promise has settled, without awaiting it.
function track<Value>(promise: Promise<Value>) {
  const state = { settled: false };
  promise.then(
    () => (state.settled = true),
    () => (state.settled = true),
  );
  return state;
}

describe("GuildMemberManager#request", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  test("GIVEN no options THEN every member is requested on the guild's shard", async () => {
    const { client, send } = createClient();

    void client.members.request(otherShardGuild).catch(() => {});
    const nonce = await sent(send);

    expect(send).toHaveBeenCalledWith(1, {
      op: GatewayOpcodes.RequestGuildMembers,
      d: { guild_id: otherShardGuild, query: "", limit: 0, presences: undefined, nonce },
    });
    expect(Buffer.byteLength(nonce)).toBeLessThanOrEqual(32);
  });

  test("GIVEN userIds THEN they are requested by ID without a query", async () => {
    const { client, send } = createClient();

    void client.members
      .request(guildId, { userIds: ["1", "2"], presences: true, nonce: "by-id" })
      .catch(() => {});
    await sent(send);

    expect(send).toHaveBeenCalledWith(0, {
      op: GatewayOpcodes.RequestGuildMembers,
      d: { guild_id: guildId, user_ids: ["1", "2"], presences: true, nonce: "by-id" },
    });
  });

  test("GIVEN an empty userIds THEN every member is requested", async () => {
    const { client, send } = createClient();

    void client.members.request(guildId, { userIds: [], nonce: "empty" }).catch(() => {});
    await sent(send);

    expect(send).toHaveBeenCalledWith(0, {
      op: GatewayOpcodes.RequestGuildMembers,
      d: { guild_id: guildId, query: "", limit: 0, presences: undefined, nonce: "empty" },
    });
  });

  test("GIVEN invalid options THEN it throws without sending", async () => {
    const { client, send } = createClient();
    const ids = Array.from({ length: 101 }, (_, index) => String(index));

    await expect(client.members.request(guildId, { query: "a", userIds: ["1"] })).rejects.toThrow(
      TypeError,
    );
    await expect(client.members.request(guildId, { userIds: ids })).rejects.toThrow(RangeError);
    await expect(client.members.request(guildId, { nonce: "n".repeat(33) })).rejects.toThrow(
      RangeError,
    );
    expect(send).not.toHaveBeenCalled();
  });

  test("GIVEN several chunks THEN it resolves with every member once the last one is cached", async () => {
    const cache = createInMemoryCache();
    const { client, send } = createClient(cache);
    const order: string[] = [];
    const upsert = cache.members!.upsert.bind(cache.members);
    vi.spyOn(cache.members!, "upsert").mockImplementation(async (key, value, options) => {
      const result = await upsert(key, value, options);
      order.push(`cached ${key}`);
      return result;
    });

    const request = client.members.request(guildId);
    const state = track(request);
    void request.then(() => order.push("resolved"));
    const nonce = await sent(send);

    await dispatch(client, GatewayDispatchEvents.GuildMembersChunk, chunk(nonce, 0, 2, ["1", "2"]));
    expect(state.settled).toBe(false);
    await dispatch(client, GatewayDispatchEvents.GuildMembersChunk, chunk(nonce, 1, 2, ["3"]));

    const members = await request;
    expect(members.map((value) => value.id)).toEqual(["1", "2", "3"]);
    expect(members[0]).toBeInstanceOf(GuildMember);
    expect(order.at(-1)).toBe("resolved");
    expect(order.filter((entry) => entry.startsWith("cached"))).toHaveLength(3);
    expect(await client.members.cache.get(client.members.resolveKey(guildId, "3"))).toBeInstanceOf(
      GuildMember,
    );
  });

  test("GIVEN two concurrent requests THEN each resolves with the chunks of its nonce", async () => {
    const { client, send } = createClient();

    const first = client.members.request(guildId, { nonce: "first" });
    await sent(send, 1);
    const second = client.members.request(guildId, { userIds: ["9"], nonce: "second" });
    await sent(send, 2);

    await dispatch(
      client,
      GatewayDispatchEvents.GuildMembersChunk,
      chunk("second", 0, 1, ["9"], { not_found: ["8"] }),
    );
    // A chunk of another request, or without nonce, is ignored.
    await dispatch(client, GatewayDispatchEvents.GuildMembersChunk, chunk("other", 0, 1, ["7"]));
    await dispatch(client, GatewayDispatchEvents.GuildMembersChunk, {
      ...chunk("", 0, 1, ["6"]),
      nonce: undefined,
    });
    await dispatch(client, GatewayDispatchEvents.GuildMembersChunk, chunk("first", 0, 1, ["1"]));

    expect((await second).map((value) => value.id)).toEqual(["9"]);
    expect((await first).map((value) => value.id)).toEqual(["1"]);
  });

  test("GIVEN a nonce already pending THEN a second request with it throws", async () => {
    const { client, send } = createClient();

    void client.members.request(guildId, { nonce: "same" }).catch(() => {});
    await sent(send);

    await expect(client.members.request(guildId, { nonce: "same" })).rejects.toThrow(/pending/);
    expect(send).toHaveBeenCalledOnce();
  });

  test("GIVEN no chunk within the time THEN it rejects and drops the request", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { client, send } = createClient();

    const request = client.members.request(guildId, { nonce: "late", time: 1000 });
    const rejection = expect(request).rejects.toThrow(GuildMembersTimeoutError);
    await sent(send);
    await vi.advanceTimersByTimeAsync(1000);

    await rejection;
    await expect(request).rejects.toMatchObject({ guildId, nonce: "late", timeout: 1000 });
    // The nonce is free again, and the late chunk is only cached.
    await dispatch(client, GatewayDispatchEvents.GuildMembersChunk, chunk("late", 0, 1, ["1"]));
    void client.members.request(guildId, { nonce: "late" }).catch(() => {});
    await sent(send, 2);
    expect(await client.members.cache.get(client.members.resolveKey(guildId, "1"))).toBeDefined();
  });

  test("GIVEN chunks keep arriving THEN each one restarts the timeout", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { client, send } = createClient();

    const request = client.members.request(guildId, { nonce: "slow", time: 1000 });
    await sent(send);
    await vi.advanceTimersByTimeAsync(600);
    await dispatch(client, GatewayDispatchEvents.GuildMembersChunk, chunk("slow", 0, 2, ["1"]));
    await vi.advanceTimersByTimeAsync(600);
    await dispatch(client, GatewayDispatchEvents.GuildMembersChunk, chunk("slow", 1, 2, ["2"]));

    expect(await request).toHaveLength(2);
  });

  test("GIVEN RATE_LIMITED for the request THEN it rejects right away", async () => {
    const { client, send } = createClient();

    const request = client.members.request(guildId, { nonce: "limited" });
    await sent(send);
    await dispatch(client, GatewayDispatchEvents.RateLimited, {
      opcode: GatewayOpcodes.RequestGuildMembers,
      retry_after: 12.5,
      meta: { guild_id: guildId, nonce: "limited" },
    });

    await expect(request).rejects.toThrow(GuildMembersRateLimitError);
    await expect(request).rejects.toMatchObject({ nonce: "limited", retryAfter: 12_500 });
  });

  test("GIVEN the shard cannot send THEN it rejects and drops the request", async () => {
    const { client, send } = createClient();
    send.mockRejectedValueOnce(new RangeError("Shard 0 not found"));

    await expect(client.members.request(guildId, { nonce: "unsent" })).rejects.toThrow(
      "Shard 0 not found",
    );
    void client.members.request(guildId, { nonce: "unsent" }).catch(() => {});
    await sent(send, 2);
  });
});

describe("guildMembersChunk", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("GIVEN GUILD_MEMBERS_CHUNK THEN the members, guild, and data are emitted", async () => {
    const { client } = createClient();
    const calls = record(client, "guildMembersChunk");
    await dispatch(client, GatewayDispatchEvents.GuildCreate, {
      id: guildId,
      name: "Pack",
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
    });

    const data = chunk("event", 0, 1, ["1", "2"], { not_found: ["3"] });
    await dispatch(client, GatewayDispatchEvents.GuildMembersChunk, data);

    expect(calls).toHaveLength(1);
    const [[members, guild, received]] = calls;
    expect(members.map((value) => value.id)).toEqual(["1", "2"]);
    expect(members[0]).toBeInstanceOf(GuildMember);
    expect(members[0]!.guild?.name).toBe("Pack");
    expect(guild).toBeInstanceOf(Guild);
    expect(received).toEqual(data);
  });

  test("GIVEN no cache THEN the event still has the members, and no guild", async () => {
    const { client } = createClient(null);
    const calls = record(client, "guildMembersChunk");

    await dispatch(client, GatewayDispatchEvents.GuildMembersChunk, chunk("none", 0, 1, ["1"]));

    expect(calls[0]![0][0]?.id).toBe("1");
    expect(calls[0]![1]).toBeNull();
  });

  test("GIVEN Guild#requestMembers THEN it requests the guild's members", async () => {
    const { client, send } = createClient();
    const guild = new Guild({ id: guildId, name: "Pack" } as never);

    const request = guild.requestMembers({ query: "wo", limit: 5, nonce: "guild" });
    await sent(send);
    await dispatch(client, GatewayDispatchEvents.GuildMembersChunk, chunk("guild", 0, 1, ["1"]));

    expect(await request).toHaveLength(1);
    expect(send).toHaveBeenCalledWith(0, {
      op: GatewayOpcodes.RequestGuildMembers,
      d: { guild_id: guildId, query: "wo", limit: 5, presences: undefined, nonce: "guild" },
    });
  });
});
