import { DiscordAPIError } from "@discordjs/rest";
import { WebSocketShardEvents } from "@discordjs/ws";
import { container } from "@wolfstar/http-framework";
import { createInMemoryCache, soundboardSoundKey } from "@wolfstar/plugin-cache";
import {
  ChannelType,
  GatewayDispatchEvents,
  GatewayOpcodes,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  GuildScheduledEventStatus,
  Routes,
  StageInstancePrivacyLevel,
  type APIGuildScheduledEvent,
  type APISoundboardSound,
  type GatewayDispatchPayload,
} from "discord-api-types/v10";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  GatewayClient,
  GuildScheduledEvent,
  SoundboardSound,
  type GatewayEventMap,
  type GatewayEventName,
  type StageChannel,
  type VoiceChannel,
} from "../src/index.js";

const guildId = "100000000000000010";
const channelId = "200000000000000020";
const eventId = "300000000000000030";
const userId = "600000000000000600";
const user = { id: userId, username: "wolf", discriminator: "0", global_name: null, avatar: null };

function createClient() {
  return new GatewayClient({
    discordPublicKey: "0".repeat(64),
    discordToken: "test-token",
    clientId: "266624760782258186",
    intents: 0,
    cache: createInMemoryCache(),
  });
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

function scheduledEvent(extra: Partial<APIGuildScheduledEvent> = {}): APIGuildScheduledEvent {
  return {
    id: eventId,
    guild_id: guildId,
    channel_id: null,
    creator_id: userId,
    creator: user,
    name: "Full moon",
    description: null,
    scheduled_start_time: "2026-10-01T20:00:00.000Z",
    scheduled_end_time: "2026-10-01T22:00:00.000Z",
    privacy_level: GuildScheduledEventPrivacyLevel.GuildOnly,
    status: GuildScheduledEventStatus.Scheduled,
    entity_type: GuildScheduledEventEntityType.External,
    entity_id: null,
    entity_metadata: { location: "The den" },
    recurrence_rule: null,
    ...extra,
  } as APIGuildScheduledEvent;
}

function sound(extra: Partial<APISoundboardSound> = {}): APISoundboardSound {
  return {
    sound_id: "400000000000000040",
    name: "howl",
    volume: 1,
    emoji_id: null,
    emoji_name: "🐺",
    guild_id: guildId,
    available: true,
    ...extra,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("scheduled events", () => {
  test("GIVEN create THEN the options are converted and the creator cached", async () => {
    const client = createClient();
    const post = vi.spyOn(container.rest, "post").mockResolvedValue(scheduledEvent());

    const event = await client.guilds.scheduledEvents(guildId).create({
      name: "Full moon",
      scheduledStartTime: Date.parse("2026-10-01T20:00:00.000Z"),
      scheduledEndTime: new Date("2026-10-01T22:00:00.000Z"),
      privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
      entityType: GuildScheduledEventEntityType.External,
      entityMetadata: { location: "The den" },
    });

    expect(post.mock.calls[0]![1]).toMatchObject({
      body: {
        name: "Full moon",
        scheduled_start_time: "2026-10-01T20:00:00.000Z",
        scheduled_end_time: "2026-10-01T22:00:00.000Z",
        entity_metadata: { location: "The den" },
      },
    });
    expect(event).toBeInstanceOf(GuildScheduledEvent);
    expect(event.location).toBe("The den");
    expect(event.url).toBe(`https://discord.com/events/${guildId}/${eventId}`);
    expect(await client.cache!.users.get(userId)).toBeDefined();
  });

  test("GIVEN setStatus THEN the event is patched", async () => {
    const client = createClient();
    vi.spyOn(container.rest, "patch").mockResolvedValue(
      scheduledEvent({ status: GuildScheduledEventStatus.Active }),
    );
    const event = await client.guilds.scheduledEvents(guildId).hydrate(scheduledEvent());

    await event.setStatus(GuildScheduledEventStatus.Active);

    expect(event.isActive()).toBe(true);
  });

  test("GIVEN fetchSubscribers THEN users and members are cached", async () => {
    const client = createClient();
    vi.spyOn(container.rest, "get").mockResolvedValue([
      {
        guild_scheduled_event_id: eventId,
        user,
        member: { roles: [], joined_at: "2026-01-01T00:00:00.000Z" },
      },
    ]);
    const event = await client.guilds.scheduledEvents(guildId).hydrate(scheduledEvent());

    const [subscriber] = await event.fetchSubscribers({ withMember: true });

    expect(subscriber!.user.id).toBe(userId);
    expect(subscriber!.member?.guildId).toBe(guildId);
  });

  test("GIVEN event dispatches THEN create, update, and user add are emitted", async () => {
    const client = createClient();
    const updated = record(client, "guildScheduledEventUpdate");
    const subscribed = record(client, "guildScheduledEventUserAdd");

    await dispatch(client, GatewayDispatchEvents.GuildScheduledEventCreate, scheduledEvent());
    await dispatch(
      client,
      GatewayDispatchEvents.GuildScheduledEventUpdate,
      scheduledEvent({ name: "Blood moon" }),
    );
    await dispatch(client, GatewayDispatchEvents.GuildScheduledEventUserAdd, {
      guild_scheduled_event_id: eventId,
      user_id: userId,
      guild_id: guildId,
    });

    const [[previous, current]] = updated;
    expect(previous?.name).toBe("Full moon");
    expect(current.name).toBe("Blood moon");
    expect(subscribed[0]![0]?.id).toBe(eventId);
    expect(subscribed[0]![1]?.id).toBe(userId);
  });
});

describe("stage instances", () => {
  const stage = {
    id: "500000000000000050",
    guild_id: guildId,
    channel_id: channelId,
    topic: "Howling lessons",
    privacy_level: StageInstancePrivacyLevel.GuildOnly,
    discoverable_disabled: false,
    guild_scheduled_event_id: null,
  };

  async function stageChannel(client: GatewayClient) {
    await client.cache!.channels.set(channelId, {
      id: channelId,
      type: ChannelType.GuildStageVoice,
      name: "stage",
      guild_id: guildId,
    } as never);
    return (await client.channels.get(channelId)) as StageChannel;
  }

  test("GIVEN createStageInstance and setTopic THEN the stage is started and edited", async () => {
    const client = createClient();
    const channel = await stageChannel(client);
    const post = vi.spyOn(container.rest, "post").mockResolvedValue(stage);
    vi.spyOn(container.rest, "patch").mockResolvedValue({ ...stage, topic: "Pack meeting" });

    const instance = await channel.createStageInstance({
      topic: "Howling lessons",
      sendStartNotification: true,
    });
    await instance.setTopic("Pack meeting");

    expect(post).toHaveBeenCalledWith(Routes.stageInstances(), {
      body: {
        channel_id: channelId,
        topic: "Howling lessons",
        privacy_level: undefined,
        send_start_notification: true,
        guild_scheduled_event_id: undefined,
      },
      reason: undefined,
    });
    expect(instance.topic).toBe("Pack meeting");
    expect(((await channel.fetchStageInstance()) ?? null)?.topic).toBe("Pack meeting");
  });

  test("GIVEN a stage that is not live THEN fetchStageInstance is null", async () => {
    const client = createClient();
    const channel = await stageChannel(client);
    vi.spyOn(container.rest, "get").mockRejectedValue(
      new DiscordAPIError(
        { code: 10_067, message: "Unknown Stage Instance" },
        10_067,
        404,
        "GET",
        "/stage-instances/x",
        {},
      ),
    );

    expect(await channel.fetchStageInstance()).toBeNull();
  });
});

describe("soundboard", () => {
  test("GIVEN fetchAll THEN the guild's sounds are cached with their URL", async () => {
    const client = createClient();
    vi.spyOn(container.rest, "get").mockResolvedValue({ items: [sound({ user })] });

    const [first] = await client.guilds.soundboardSounds(guildId).fetchAll();

    expect(first).toBeInstanceOf(SoundboardSound);
    expect(first!.user?.id).toBe(userId);
    expect(first!.url).toBe("https://cdn.discordapp.com/soundboard-sounds/400000000000000040");
    expect(
      await client.cache!.soundboardSounds.get(soundboardSoundKey(guildId, first!.soundId)),
    ).toBeDefined();
  });

  test("GIVEN a default sound THEN it cannot be edited, and it can be played", async () => {
    const client = createClient();
    await client.cache!.channels.set(channelId, {
      id: channelId,
      type: ChannelType.GuildVoice,
      name: "voice",
      guild_id: guildId,
    } as never);
    const post = vi.spyOn(container.rest, "post").mockResolvedValue(undefined);
    vi.spyOn(container.rest, "get").mockResolvedValue([
      sound({ sound_id: "1", guild_id: undefined }),
    ]);
    const channel = (await client.channels.get(channelId)) as VoiceChannel;

    const [howl] = await client.fetchDefaultSoundboardSounds();
    await channel.sendSoundboardSound(howl!);

    await expect(howl!.edit({ name: "x" })).rejects.toThrow(/Default soundboard sounds/);
    expect(post).toHaveBeenCalledWith(Routes.sendSoundboardSound(channelId), {
      body: { sound_id: "1", source_guild_id: undefined },
    });
  });

  test("GIVEN GUILD_SOUNDBOARD_SOUND_DELETE THEN the cached sound is emitted", async () => {
    const client = createClient();
    const calls = record(client, "guildSoundboardSoundDelete");

    await dispatch(client, GatewayDispatchEvents.GuildSoundboardSoundCreate, sound());
    await dispatch(client, GatewayDispatchEvents.GuildSoundboardSoundDelete, {
      sound_id: sound().sound_id,
      guild_id: guildId,
    });

    expect(calls[0]![0]?.name).toBe("howl");
  });
});
