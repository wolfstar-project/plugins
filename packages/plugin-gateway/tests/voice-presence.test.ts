import { DiscordAPIError } from "@discordjs/rest";
import { WebSocketShardEvents } from "@discordjs/ws";
import { container } from "@wolfstar/http-framework";
import { createInMemoryCache, memberKey, voiceStateKey } from "@wolfstar/plugin-cache";
import {
  ActivityType,
  GatewayDispatchEvents,
  GatewayOpcodes,
  PresenceUpdateStatus,
  Routes,
  type GatewayDispatchPayload,
} from "discord-api-types/v10";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  Activity,
  GatewayClient,
  GuildMember,
  VoiceState,
  type GatewayEventMap,
  type GatewayEventName,
} from "../src/index.js";

const guildId = "100000000000000010";
const channelId = "200000000000000020";
const userId = "600000000000000600";
const user = { id: userId, username: "wolf", discriminator: "0", global_name: null, avatar: null };
const member = { user, roles: [], joined_at: "2026-01-01T00:00:00.000Z", deaf: false, mute: false };

function createClient() {
  return new GatewayClient({
    discordPublicKey: "0".repeat(64),
    discordToken: "test-token",
    clientId: "266624760782258186",
    intents: 0,
    cache: createInMemoryCache(),
  });
}

function voiceState(extra: Record<string, unknown> = {}) {
  return {
    guild_id: guildId,
    channel_id: channelId,
    user_id: userId,
    session_id: "session",
    deaf: false,
    mute: false,
    self_deaf: false,
    self_mute: true,
    self_video: false,
    suppress: false,
    request_to_speak_timestamp: null,
    ...extra,
  };
}

async function dispatch(client: GatewayClient, t: GatewayDispatchEvents, d: unknown) {
  const payload = { op: GatewayOpcodes.Dispatch, s: 1, t, d } as GatewayDispatchPayload;
  client.gateway.emit(WebSocketShardEvents.Dispatch, payload, 0);
  await client.idle();
}

function record<Event extends GatewayEventName>(client: GatewayClient, event: Event) {
  const calls: GatewayEventMap[Event][] = [];
  client.on(event, (...args: any[]) => {
    calls.push(args as GatewayEventMap[Event]);
  });
  return calls;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("voice states", () => {
  test("GIVEN VOICE_STATE_UPDATE twice THEN the previous state and the member are emitted", async () => {
    const client = createClient();
    const calls = record(client, "voiceStateUpdate");

    await dispatch(client, GatewayDispatchEvents.VoiceStateUpdate, voiceState({ member }));
    await dispatch(
      client,
      GatewayDispatchEvents.VoiceStateUpdate,
      voiceState({ channel_id: null }),
    );

    const [[first, joined], [previous, left]] = calls;
    expect(first).toBeNull();
    expect(joined).toBeInstanceOf(VoiceState);
    expect(joined.member).toBeInstanceOf(GuildMember);
    expect(joined.mute).toBe(true);
    expect(previous?.channelId).toBe(channelId);
    expect(left.channelId).toBeNull();
  });

  test("GIVEN setMute THEN the member is edited", async () => {
    const client = createClient();
    const patch = vi.spyOn(container.rest, "patch").mockResolvedValue({ ...member, mute: true });
    const state = await client.voiceStates.hydrate(voiceState());

    await state.setMute(true, "noise");

    expect(patch).toHaveBeenCalledWith(Routes.guildMember(guildId, userId), {
      body: expect.objectContaining({ mute: true }),
      reason: "noise",
    });
  });

  test("GIVEN another member's state THEN requesting to speak throws", async () => {
    const client = createClient();
    const state = await client.voiceStates.hydrate(voiceState());

    await expect(state.setRequestToSpeak()).rejects.toThrow(/own voice state/);
  });

  test("GIVEN fetchVoiceState THEN it reads the cache, and returns null for a disconnected member", async () => {
    const client = createClient();
    await client.cache!.members.set(memberKey(guildId, userId), { ...member, guild_id: guildId });
    await client.cache!.voiceStates.set(voiceStateKey(guildId, userId), voiceState() as never);
    const cachedMember = await client.members.get(guildId, userId);

    expect((await cachedMember!.fetchVoiceState())?.sessionId).toBe("session");

    await client.cache!.voiceStates.delete(voiceStateKey(guildId, userId));
    vi.spyOn(container.rest, "get").mockRejectedValue(
      new DiscordAPIError(
        { code: 10_065, message: "Unknown Voice State" },
        10_065,
        404,
        "GET",
        "/guilds/x/voice-states/y",
        {},
      ),
    );
    expect(await cachedMember!.fetchVoiceState()).toBeNull();
  });
});

describe("presences", () => {
  const presence = {
    guild_id: guildId,
    user: { id: userId },
    status: PresenceUpdateStatus.Online,
    activities: [
      {
        name: "Spotify",
        type: ActivityType.Listening,
        created_at: 1_700_000_000_000,
        assets: { large_image: "spotify:abc" },
      },
    ],
    client_status: { desktop: PresenceUpdateStatus.Online },
  };

  test("GIVEN PRESENCE_UPDATE THEN the presence has its activities and cached user", async () => {
    const client = createClient();
    await client.cache!.users.set(userId, user);
    const calls = record(client, "presenceUpdate");

    await dispatch(client, GatewayDispatchEvents.PresenceUpdate, presence);
    await dispatch(client, GatewayDispatchEvents.PresenceUpdate, {
      ...presence,
      status: PresenceUpdateStatus.Idle,
    });

    const [[first, online], [previous, idle]] = calls;
    expect(first).toBeNull();
    expect(online.user?.username).toBe("wolf");
    expect(online.activities[0]).toBeInstanceOf(Activity);
    expect(online.activities[0]!.assets?.largeImageURL()).toBe("https://i.scdn.co/image/abc");
    expect(previous?.status).toBe(PresenceUpdateStatus.Online);
    expect(idle.status).toBe(PresenceUpdateStatus.Idle);
    expect(idle.equals(online)).toBe(false);
  });

  test("GIVEN an uncached presence THEN fetch rejects and fetchPresence is null", async () => {
    const client = createClient();
    await client.cache!.members.set(memberKey(guildId, userId), { ...member, guild_id: guildId });
    const cachedMember = await client.members.get(guildId, userId);

    await expect(client.presences.fetch(guildId, userId)).rejects.toThrow(/cannot be fetched/);
    expect(await cachedMember!.fetchPresence()).toBeNull();
  });
});
