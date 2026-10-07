import { WebSocketShardEvents } from "@discordjs/ws";
import { createInMemoryCache, MemoryEntityCache, type EntityCache } from "@wolfstar/plugin-cache";
import {
  GatewayDispatchEvents,
  GatewayOpcodes,
  type APISoundboardSound,
  type GatewayDispatchPayload,
} from "discord-api-types/v10";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  GatewayClient,
  GuildSoundboardSoundsTimeoutError,
  SoundboardSound,
  type GatewayClientOptions,
  type GatewayEventMap,
  type GatewayEventName,
} from "../src/index.js";

// Guilds "10" and "12" land on shard 0 of 2 (`(id >> 22) % 2`), guild `4194304` (`1 << 22`) on shard 1.
const firstGuild = "10";
const secondGuild = "12";
const otherShardGuild = String(1 << 22);

// A store answering with promises, like Redis.
function asynchronousStore(): EntityCache<any> {
  const inner = new MemoryEntityCache<any>();
  return {
    get: async (key) => inner.get(key),
    set: async (key, value, options) => inner.set(key, value, options),
    upsert: async (key, data, options) => inner.upsert(key, data, options),
    has: async (key) => inner.has(key),
    delete: async (key) => inner.delete(key),
    clear: async () => inner.clear(),
    getSize: async () => inner.getSize(),
    keys: async () => inner.keys(),
    values: async () => inner.values(),
    entries: async () => inner.entries(),
  };
}

function createClient(options: Partial<GatewayClientOptions> = {}) {
  const client = new GatewayClient({
    discordPublicKey: "0".repeat(64),
    discordToken: "test-token",
    clientId: "266624760782258186",
    intents: 0,
    cache: createInMemoryCache(),
    ...options,
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

function sound(guildId: string, id: string): APISoundboardSound {
  return {
    name: `sound ${id}`,
    sound_id: id,
    volume: 1,
    emoji_id: null,
    emoji_name: null,
    guild_id: guildId,
    available: true,
  };
}

function reply(guildId: string, ids: string[]) {
  return { guild_id: guildId, soundboard_sounds: ids.map((id) => sound(guildId, id)) };
}

function record<Event extends GatewayEventName>(client: GatewayClient, event: Event) {
  const calls: GatewayEventMap[Event][] = [];
  client.on(event, (...args: any[]) => {
    calls.push(args as GatewayEventMap[Event]);
  });
  return calls;
}

// Lets `fetchSoundboardSounds` send its payloads and arm its timeout.
async function sent(send: ReturnType<typeof createClient>["send"], calls = 1) {
  await new Promise(setImmediate);
  expect(send).toHaveBeenCalledTimes(calls);
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

const modes = [
  ["a synchronous cache", {}],
  ["the default cache of instances", { cache: undefined }],
  ["an asynchronous cache", { cache: undefined, makeCache: () => asynchronousStore() }],
] as const;

describe.each(modes)("GuildManager#fetchSoundboardSounds with %s", (_name, options) => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("GIVEN replies THEN it resolves, once the last one is cached, with the sounds of each guild", async () => {
    const { client, send } = createClient(options);

    const request = client.guilds.fetchSoundboardSounds([otherShardGuild, firstGuild]);
    const state = track(request);
    await sent(send, 2);

    await dispatch(client, GatewayDispatchEvents.SoundboardSounds, reply(firstGuild, ["1", "2"]));
    expect(state.settled).toBe(false);
    await dispatch(client, GatewayDispatchEvents.SoundboardSounds, reply(otherShardGuild, []), 1);

    const result = await request;
    expect([...result.keys()]).toEqual([otherShardGuild, firstGuild]);
    expect([...result.get(firstGuild)!.keys()]).toEqual(["1", "2"]);
    expect(result.get(firstGuild)!.get("1")).toBeInstanceOf(SoundboardSound);
    expect(result.get(otherShardGuild)!.size).toBe(0);

    const manager = client.guilds.soundboardSounds(firstGuild);
    expect(await manager.cache.get(manager.resolveKey("2"))).toBeInstanceOf(SoundboardSound);
  });
});

describe("GuildManager#fetchSoundboardSounds", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  test("GIVEN guilds on two shards THEN each shard gets one request with its guilds", async () => {
    const { client, send } = createClient();

    void client.guilds
      .fetchSoundboardSounds([firstGuild, otherShardGuild, secondGuild])
      .catch(() => {});
    await sent(send, 2);

    expect(send).toHaveBeenCalledWith(0, {
      op: GatewayOpcodes.RequestSoundboardSounds,
      d: { guild_ids: [firstGuild, secondGuild] },
    });
    expect(send).toHaveBeenCalledWith(1, {
      op: GatewayOpcodes.RequestSoundboardSounds,
      d: { guild_ids: [otherShardGuild] },
    });
  });

  test("GIVEN a repeated guild ID THEN it is requested once", async () => {
    const { client, send } = createClient();

    const request = client.guilds.fetchSoundboardSounds([firstGuild, firstGuild]);
    await sent(send);
    await dispatch(client, GatewayDispatchEvents.SoundboardSounds, reply(firstGuild, ["1"]));

    expect(send).toHaveBeenCalledWith(0, {
      op: GatewayOpcodes.RequestSoundboardSounds,
      d: { guild_ids: [firstGuild] },
    });
    expect([...(await request).keys()]).toEqual([firstGuild]);
  });

  test("GIVEN no guild ID THEN it resolves empty without sending", async () => {
    const { client, send } = createClient();

    const result = await client.guilds.fetchSoundboardSounds([]);

    expect(result.size).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  test("GIVEN a reply for a guild nobody requested THEN the request keeps waiting", async () => {
    const { client, send } = createClient();

    const request = client.guilds.fetchSoundboardSounds([firstGuild]);
    const state = track(request);
    await sent(send);

    await dispatch(client, GatewayDispatchEvents.SoundboardSounds, reply(secondGuild, ["9"]));
    expect(state.settled).toBe(false);

    await dispatch(client, GatewayDispatchEvents.SoundboardSounds, reply(firstGuild, ["1"]));
    expect((await request).get(firstGuild)!.size).toBe(1);
  });

  test("GIVEN two requests for a guild THEN one reply resolves both", async () => {
    const { client, send } = createClient();

    const first = client.guilds.fetchSoundboardSounds([firstGuild]);
    const second = client.guilds.fetchSoundboardSounds([firstGuild, secondGuild]);
    await sent(send, 2);

    await dispatch(client, GatewayDispatchEvents.SoundboardSounds, reply(firstGuild, ["1"]));
    await dispatch(client, GatewayDispatchEvents.SoundboardSounds, reply(secondGuild, ["2"]));

    expect([...(await first).keys()]).toEqual([firstGuild]);
    expect([...(await second).keys()]).toEqual([firstGuild, secondGuild]);
  });

  test("GIVEN no reply within the time THEN it rejects with the missing guilds, and a late reply is only cached", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { client, send } = createClient();

    const request = client.guilds.fetchSoundboardSounds([firstGuild, secondGuild], { time: 1000 });
    const rejection = expect(request).rejects.toThrow(GuildSoundboardSoundsTimeoutError);
    const state = track(request);
    await sent(send);

    await vi.advanceTimersByTimeAsync(600);
    await dispatch(client, GatewayDispatchEvents.SoundboardSounds, reply(firstGuild, ["1"]));
    // The reply restarted the timeout: 900ms after it, the request is still pending.
    await vi.advanceTimersByTimeAsync(900);
    expect(state.settled).toBe(false);
    await vi.advanceTimersByTimeAsync(200);

    await rejection;
    await expect(request).rejects.toMatchObject({ guildIds: [secondGuild], timeout: 1000 });

    await dispatch(client, GatewayDispatchEvents.SoundboardSounds, reply(secondGuild, ["2"]));
    const manager = client.guilds.soundboardSounds(secondGuild);
    expect(await manager.cache.get(manager.resolveKey("2"))).toBeInstanceOf(SoundboardSound);
  });

  test("GIVEN the shard cannot send THEN it rejects and drops the request", async () => {
    const { client, send } = createClient();
    send.mockRejectedValueOnce(new RangeError("Shard 0 not found"));

    await expect(client.guilds.fetchSoundboardSounds([firstGuild])).rejects.toThrow(
      "Shard 0 not found",
    );

    await dispatch(client, GatewayDispatchEvents.SoundboardSounds, reply(firstGuild, ["1"]));
    void client.guilds.fetchSoundboardSounds([firstGuild]).catch(() => {});
    await sent(send, 2);
  });

  test("GIVEN one of two shards cannot send THEN it rejects, and the reply of the other is only cached", async () => {
    const { client, send } = createClient();
    send.mockResolvedValueOnce().mockRejectedValueOnce(new Error("down"));

    await expect(
      client.guilds.fetchSoundboardSounds([firstGuild, otherShardGuild]),
    ).rejects.toThrow("down");

    await dispatch(client, GatewayDispatchEvents.SoundboardSounds, reply(firstGuild, ["1"]));
    const manager = client.guilds.soundboardSounds(firstGuild);
    expect(await manager.cache.get(manager.resolveKey("1"))).toBeInstanceOf(SoundboardSound);
  });

  test("GIVEN no cache THEN it resolves with the sounds of the replies", async () => {
    const { client, send } = createClient({ cache: null });

    const request = client.guilds.fetchSoundboardSounds([firstGuild]);
    await sent(send);
    await dispatch(client, GatewayDispatchEvents.SoundboardSounds, reply(firstGuild, ["1"]));

    expect((await request).get(firstGuild)!.get("1")).toBeInstanceOf(SoundboardSound);
  });

  test("GIVEN SOUNDBOARD_SOUNDS THEN soundboardSounds is still emitted with the sounds and the guild ID", async () => {
    const { client } = createClient();
    const calls = record(client, "soundboardSounds");

    await dispatch(client, GatewayDispatchEvents.SoundboardSounds, reply(firstGuild, ["1", "2"]));

    expect(calls).toHaveLength(1);
    const [[sounds, guildId]] = calls;
    expect(sounds.map((value) => value.soundId)).toEqual(["1", "2"]);
    expect(guildId).toBe(firstGuild);
  });
});
