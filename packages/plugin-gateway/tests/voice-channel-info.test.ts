import { WebSocketShardEvents } from "@discordjs/ws";
import { createInMemoryCache, type Cache } from "@wolfstar/plugin-cache";
import {
  ChannelType,
  GatewayDispatchEvents,
  GatewayOpcodes,
  Routes,
  type GatewayDispatchPayload,
  type GatewayRequestChannelInfo,
} from "discord-api-types/v10";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  GatewayClient,
  GatewayErrorCodes,
  GatewayRangeError,
  Guild,
  GuildChannelInfoTimeoutError,
  VoiceChannel,
  type GatewayEventMap,
  type GatewayEventName,
} from "../src/index.js";

const guildId = "10";
const voiceId = "50";
// Guild "10" lands on shard 0 of 2 (`(id >> 22) % 2`), guild `4194304` (`1 << 22`) on shard 1.
const otherShardGuild = String(1 << 22);

function voiceChannel(extra: Record<string, unknown> = {}) {
  return { id: voiceId, type: ChannelType.GuildVoice, guild_id: guildId, name: "den", ...extra };
}

function createClient(cache: Cache | null | undefined = createInMemoryCache()) {
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

function record<Event extends GatewayEventName>(client: GatewayClient, event: Event) {
  const calls: GatewayEventMap[Event][] = [];
  client.on(event, (...args: any[]) => {
    calls.push(args as GatewayEventMap[Event]);
  });
  return calls;
}

// Lets the queued request send its payload and arm its timeout.
async function sent(send: ReturnType<typeof createClient>["send"], calls = 1) {
  await new Promise(setImmediate);
  expect(send).toHaveBeenCalledTimes(calls);
  return send.mock.calls[calls - 1]![1] as GatewayRequestChannelInfo;
}

function track<Value>(promise: Promise<Value>) {
  const state = { settled: false };
  promise.then(
    () => (state.settled = true),
    () => (state.settled = true),
  );
  return state;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe.each([
  ["a store of raw entities", () => createClient(createInMemoryCache())],
  ["the default cache of instances", () => createClient(undefined)],
] as const)("voice channel status and start time with %s", (_name, create) => {
  async function seed() {
    const created = create();
    await created.client.channels._add(voiceChannel() as never);
    return created;
  }

  test("GIVEN no info yet THEN status and start time are null", async () => {
    const { client } = await seed();
    const channel = (await client.channels.cache.get(voiceId)) as VoiceChannel;

    expect(channel).toBeInstanceOf(VoiceChannel);
    expect(channel.status).toBeNull();
    expect(channel.voiceStartTimestamp).toBeNull();
    expect(channel.voiceStartAt).toBeNull();
  });

  test("GIVEN a VOICE_CHANNEL_STATUS_UPDATE THEN voiceChannelStatusUpdate carries both states", async () => {
    const { client } = await seed();
    const calls = record(client, "voiceChannelStatusUpdate");

    await dispatch(client, GatewayDispatchEvents.VoiceChannelStatusUpdate, {
      id: voiceId,
      guild_id: guildId,
      status: "movie night",
    });
    await dispatch(client, GatewayDispatchEvents.VoiceChannelStatusUpdate, {
      id: voiceId,
      guild_id: guildId,
      status: null,
    });

    expect(calls).toHaveLength(2);
    const [[first, second], [second2, third]] = calls as [
      [VoiceChannel, VoiceChannel],
      [VoiceChannel, VoiceChannel],
    ];
    expect(first.status).toBeNull();
    expect(second.status).toBe("movie night");
    expect(second2.status).toBe("movie night");
    expect(third.status).toBeNull();
  });

  test("GIVEN a VOICE_CHANNEL_START_TIME_UPDATE THEN the start is exposed in milliseconds", async () => {
    const { client } = await seed();
    const calls = record(client, "voiceChannelStartTimeUpdate");

    await dispatch(client, GatewayDispatchEvents.VoiceChannelStartTimeUpdate, {
      id: voiceId,
      guild_id: guildId,
      voice_start_time: 1_700_000_000,
    });
    await dispatch(client, GatewayDispatchEvents.VoiceChannelStartTimeUpdate, {
      id: voiceId,
      guild_id: guildId,
    });

    expect(calls).toHaveLength(2);
    const [oldStarted, started] = calls[0]!;
    expect(oldStarted.voiceStartTimestamp).toBeNull();
    expect(started.voiceStartTimestamp).toBe(1_700_000_000_000);
    expect(started.voiceStartAt).toEqual(new Date(1_700_000_000_000));
    const [, stopped] = calls[1]!;
    expect(stopped.voiceStartTimestamp).toBeNull();
    expect(stopped.voiceStartAt).toBeNull();
  });

  test("GIVEN an uncached channel THEN the updates emit nothing", async () => {
    const { client } = create();
    const status = record(client, "voiceChannelStatusUpdate");
    const start = record(client, "voiceChannelStartTimeUpdate");

    await dispatch(client, GatewayDispatchEvents.VoiceChannelStatusUpdate, {
      id: voiceId,
      guild_id: guildId,
      status: "x",
    });
    await dispatch(client, GatewayDispatchEvents.VoiceChannelStartTimeUpdate, {
      id: voiceId,
      guild_id: guildId,
      voice_start_time: 1,
    });

    expect(status).toEqual([]);
    expect(start).toEqual([]);
  });

  test("GIVEN a CHANNEL_UPDATE THEN the status and start time are kept", async () => {
    const { client } = await seed();
    await dispatch(client, GatewayDispatchEvents.VoiceChannelStatusUpdate, {
      id: voiceId,
      guild_id: guildId,
      status: "movie night",
    });
    await dispatch(client, GatewayDispatchEvents.VoiceChannelStartTimeUpdate, {
      id: voiceId,
      guild_id: guildId,
      voice_start_time: 1_700_000_000,
    });

    await dispatch(client, GatewayDispatchEvents.ChannelUpdate, voiceChannel({ name: "lair" }));

    const channel = (await client.channels.cache.get(voiceId)) as VoiceChannel;
    expect(channel.name).toBe("lair");
    expect(channel.status).toBe("movie night");
    expect(channel.voiceStartTimestamp).toBe(1_700_000_000_000);
  });

  test("GIVEN a CHANNEL_INFO THEN the cached voice channels are patched and emitted", async () => {
    const { client } = await seed();
    await client.channels._add({
      id: "51",
      type: ChannelType.GuildText,
      guild_id: guildId,
      name: "text",
    } as never);
    const calls = record(client, "channelInfo");

    await dispatch(client, GatewayDispatchEvents.ChannelInfo, {
      guild_id: guildId,
      channels: [
        { id: voiceId, status: "hello", voice_start_time: 1_700_000_000 },
        { id: "51", status: "ignored" },
        { id: "52", status: "uncached" },
      ],
    });

    expect(calls).toHaveLength(1);
    const [channels, guild] = calls[0]!;
    expect(channels.map((channel) => channel.id)).toEqual([voiceId]);
    expect(channels[0]!.status).toBe("hello");
    expect(channels[0]!.voiceStartTimestamp).toBe(1_700_000_000_000);
    expect(guild).toBeNull();
  });

  test("GIVEN a status THEN toJSON keeps the raw fields", async () => {
    const { client } = await seed();
    await dispatch(client, GatewayDispatchEvents.VoiceChannelStatusUpdate, {
      id: voiceId,
      guild_id: guildId,
      status: "movie night",
    });
    await dispatch(client, GatewayDispatchEvents.VoiceChannelStartTimeUpdate, {
      id: voiceId,
      guild_id: guildId,
      voice_start_time: 1_700_000_000,
    });

    const channel = (await client.channels.cache.get(voiceId)) as VoiceChannel;

    expect(channel.toJSON()).toMatchObject({
      status: "movie night",
      voice_start_time: 1_700_000_000,
    });
  });
});

describe("VoiceChannel#setStatus", () => {
  test("GIVEN a status THEN it is put with the reason", async () => {
    const { client } = createClient();
    const put = vi.spyOn(client.api.rest, "put").mockResolvedValue(undefined);
    const channel = (await client.channels._add(voiceChannel() as never)) as VoiceChannel;

    await channel.setStatus("movie night", "party");

    expect(put).toHaveBeenCalledWith(Routes.channelVoiceStatus(voiceId), {
      body: { status: "movie night" },
      reason: "party",
    });
  });

  test("GIVEN null THEN the status is cleared", async () => {
    const { client } = createClient();
    const put = vi.spyOn(client.api.rest, "put").mockResolvedValue(undefined);
    const channel = (await client.channels._add(voiceChannel() as never)) as VoiceChannel;

    await channel.setStatus(null);

    expect(put).toHaveBeenCalledWith(Routes.channelVoiceStatus(voiceId), {
      body: { status: null },
      reason: undefined,
    });
  });
});

describe("ChannelManager#requestInfo", () => {
  test("GIVEN fields THEN they are requested on the guild's shard", async () => {
    const { client, send } = createClient();

    void client.channels
      .requestInfo(otherShardGuild, { fields: ["status", "voice_start_time"] })
      .catch(() => {});
    await sent(send);

    expect(send).toHaveBeenCalledWith(1, {
      op: GatewayOpcodes.RequestChannelInfo,
      d: { guild_id: otherShardGuild, fields: ["status", "voice_start_time"] },
    });
  });

  test("GIVEN no fields THEN it rejects before sending", async () => {
    const { client, send } = createClient();

    const error = await client.channels.requestInfo(guildId, { fields: [] }).catch((e) => e);

    expect(error).toBeInstanceOf(GatewayRangeError);
    expect(error.code).toBe(GatewayErrorCodes.ChannelInfoFieldsEmpty);
    expect(send).not.toHaveBeenCalled();
  });

  test("GIVEN the reply THEN it resolves with the cached voice channels once they are updated", async () => {
    const { client, send } = createClient();
    await client.channels._add(voiceChannel() as never);
    await client.channels._add({
      id: "51",
      type: ChannelType.GuildText,
      guild_id: guildId,
    } as never);

    const request = client.channels.requestInfo(guildId, { fields: ["status"] });
    await sent(send);
    await dispatch(client, GatewayDispatchEvents.ChannelInfo, {
      guild_id: guildId,
      channels: [{ id: voiceId, status: "hello" }, { id: "51" }, { id: "52", status: "uncached" }],
    });

    const channels = await request;
    expect(channels.map((channel) => channel.id)).toEqual([voiceId]);
    expect(channels[0]).toBeInstanceOf(VoiceChannel);
    expect(channels[0]!.status).toBe("hello");
  });

  test("GIVEN an empty reply THEN it still resolves", async () => {
    const { client, send } = createClient();

    const request = client.channels.requestInfo(guildId, { fields: ["status"] });
    await sent(send);
    await dispatch(client, GatewayDispatchEvents.ChannelInfo, { guild_id: guildId, channels: [] });

    expect(await request).toEqual([]);
  });

  test("GIVEN the reply of another guild THEN the request keeps waiting", async () => {
    const { client, send } = createClient();

    const request = client.channels.requestInfo(guildId, { fields: ["status"] });
    const state = track(request);
    await sent(send);
    await dispatch(client, GatewayDispatchEvents.ChannelInfo, {
      guild_id: otherShardGuild,
      channels: [],
    });

    expect(state.settled).toBe(false);

    await dispatch(client, GatewayDispatchEvents.ChannelInfo, { guild_id: guildId, channels: [] });
    await request;
    expect(state.settled).toBe(true);
  });

  test("GIVEN requests for one guild THEN each is sent after the previous was answered", async () => {
    const { client, send } = createClient();

    const first = client.channels.requestInfo(guildId, { fields: ["status"] });
    const second = client.channels.requestInfo(guildId, { fields: ["voice_start_time"] });
    const third = client.channels.requestInfo(otherShardGuild, { fields: ["status"] });

    await new Promise(setImmediate);
    // The other guild is not held back.
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.map(([shardId]) => shardId)).toEqual([0, 1]);

    await dispatch(client, GatewayDispatchEvents.ChannelInfo, { guild_id: guildId, channels: [] });
    await first;
    const body = await sent(send, 3);
    expect(body.d).toEqual({ guild_id: guildId, fields: ["voice_start_time"] });

    await dispatch(client, GatewayDispatchEvents.ChannelInfo, { guild_id: guildId, channels: [] });
    await dispatch(client, GatewayDispatchEvents.ChannelInfo, {
      guild_id: otherShardGuild,
      channels: [],
    });
    await Promise.all([second, third]);
  });

  test("GIVEN no reply THEN it rejects after the time, and the next request is still sent", async () => {
    vi.useFakeTimers();
    const { client, send } = createClient();

    const first = client.channels
      .requestInfo(guildId, { fields: ["status"], time: 1000 })
      .catch((error) => error);
    const second = client.channels.requestInfo(guildId, { fields: ["status"] });
    second.catch(() => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    const error = await first;
    expect(error).toBeInstanceOf(GuildChannelInfoTimeoutError);
    expect(error).toMatchObject({ guildId, timeout: 1000 });
    expect(error.code).toBe(GatewayErrorCodes.GuildChannelInfoTimeout);

    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(2);

    await dispatch(client, GatewayDispatchEvents.ChannelInfo, { guild_id: guildId, channels: [] });
    expect(await second).toEqual([]);
  });

  test("GIVEN a late reply after the timeout THEN the cache is still updated", async () => {
    vi.useFakeTimers();
    const { client } = createClient();
    await client.channels._add(voiceChannel() as never);
    const calls = record(client, "channelInfo");

    const request = client.channels
      .requestInfo(guildId, { fields: ["status"], time: 1000 })
      .catch((error) => error);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await request).toBeInstanceOf(GuildChannelInfoTimeoutError);

    await dispatch(client, GatewayDispatchEvents.ChannelInfo, {
      guild_id: guildId,
      channels: [{ id: voiceId, status: "late" }],
    });

    expect(calls).toHaveLength(1);
    const channel = (await client.channels.cache.get(voiceId)) as VoiceChannel;
    expect(channel.status).toBe("late");
  });

  test("GIVEN the send fails THEN it rejects with that error and the queue moves on", async () => {
    const { client, send } = createClient();
    const failure = new Error("shard down");
    send.mockRejectedValueOnce(failure);

    const failed = client.channels.requestInfo(guildId, { fields: ["status"] });
    failed.catch(() => {});
    const next = client.channels.requestInfo(guildId, { fields: ["status"] });

    await expect(failed).rejects.toBe(failure);
    await sent(send, 2);
    await dispatch(client, GatewayDispatchEvents.ChannelInfo, { guild_id: guildId, channels: [] });
    expect(await next).toEqual([]);
  });

  test("GIVEN Guild#requestChannelInfo THEN it requests the guild's channel info", async () => {
    const { client, send } = createClient();
    const guild = new Guild({ id: guildId, name: "Pack" } as never);

    const request = guild.requestChannelInfo({ fields: ["status"] });
    const body = await sent(send);
    await dispatch(client, GatewayDispatchEvents.ChannelInfo, { guild_id: guildId, channels: [] });

    expect(body).toEqual({
      op: GatewayOpcodes.RequestChannelInfo,
      d: { guild_id: guildId, fields: ["status"] },
    });
    expect(await request).toEqual([]);
  });
});
