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
  Channel,
  Guild,
  GatewayClient,
  GuildMember,
  Message,
  User,
  type GatewayEventMap,
  type GatewayEventName,
} from "../src/index.js";

const user: APIUser = {
  id: "266624760782258186",
  username: "wolf",
  discriminator: "0",
  global_name: "Wolf",
  avatar: null,
};

function createClient(cache: Cache | null = createInMemoryCache()) {
  return new GatewayClient({
    discordPublicKey: "0".repeat(64),
    discordToken: "MjY2NjI0NzYwNzgyMjU4MTg2.token.secret",
    intents: 0,
    cache: cache ?? undefined,
  });
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

function message(id: string, content: string) {
  return {
    id,
    channel_id: "20",
    guild_id: "10",
    author: user,
    member: {
      roles: [],
      joined_at: "2024-01-01T00:00:00.000Z",
      deaf: false,
      mute: false,
      flags: 0,
    },
    content,
    mentions: [],
    mention_roles: [],
    attachments: [],
    embeds: [],
    pinned: false,
    tts: false,
    mention_everyone: false,
    timestamp: "2024-01-01T00:00:00.000Z",
    edited_timestamp: null,
    type: 0,
  };
}

const guild = {
  id: "10",
  name: "Pack",
  icon: null,
  owner_id: user.id,
  roles: [],
  emojis: [],
  stickers: [],
  features: [],
  member_count: 1,
  channels: [{ id: "20", type: ChannelType.GuildText, name: "general" }],
  threads: [],
  members: [{ user, roles: [], joined_at: "2024-01-01T00:00:00.000Z" }],
  presences: [],
  voice_states: [],
  stage_instances: [],
  guild_scheduled_events: [],
  soundboard_sounds: [],
};

describe("GatewayClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("GIVEN the client THEN it registers itself as container.client", () => {
    const client = createClient();

    expect(container.client).toBe(client);
  });

  test("GIVEN READY THEN client.user is set and shardReady is emitted", async () => {
    const client = createClient();
    const calls = record(client, "shardReady");

    await dispatch(client, GatewayDispatchEvents.Ready, { user, guilds: [], session_id: "s" }, 3);

    expect(client.user).toBeInstanceOf(User);
    expect(client.user?.displayName).toBe("Wolf");
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toBe(3);
  });

  test("GIVEN MESSAGE_CREATE THEN a Message is emitted and cached", async () => {
    const client = createClient();
    const calls = record(client, "messageCreate");

    await dispatch(client, GatewayDispatchEvents.MessageCreate, message("30", "hello"));

    const [[emitted]] = calls as [[Message]];
    expect(emitted).toBeInstanceOf(Message);
    expect(emitted.content).toBe("hello");
    expect(emitted.author.username).toBe("wolf");
    expect(emitted.member).toBeInstanceOf(GuildMember);
    expect(emitted.url).toBe("https://discord.com/channels/10/20/30");

    expect((await client.messages.get("20", "30"))?.content).toBe("hello");
    expect((await client.users.get(user.id))?.username).toBe("wolf");
  });

  test("GIVEN MESSAGE_UPDATE THEN the previous state comes from the cache", async () => {
    const client = createClient();
    const calls = record(client, "messageUpdate");

    await dispatch(client, GatewayDispatchEvents.MessageCreate, message("30", "before"));
    await dispatch(client, GatewayDispatchEvents.MessageUpdate, message("30", "after"));

    const [[previous, current]] = calls;
    expect(previous?.content).toBe("before");
    expect(current.content).toBe("after");
  });

  test("GIVEN MESSAGE_DELETE THEN the cached message is emitted and dropped", async () => {
    const client = createClient();
    const calls = record(client, "messageDelete");

    await dispatch(client, GatewayDispatchEvents.MessageCreate, message("30", "bye"));
    await dispatch(client, GatewayDispatchEvents.MessageDelete, { id: "30", channel_id: "20" });

    const [[deleted, data]] = calls;
    expect(deleted?.content).toBe("bye");
    expect(data).toEqual({ id: "30", channel_id: "20" });
    expect(await client.messages.get("20", "30")).toBeUndefined();
  });

  test("GIVEN GUILD_CREATE THEN the guild and its collections are reachable through the managers", async () => {
    const client = createClient();
    const calls = record(client, "guildCreate");

    await dispatch(client, GatewayDispatchEvents.GuildCreate, guild);

    const [[created]] = calls;
    expect(created).toBeInstanceOf(Guild);
    expect(created.name).toBe("Pack");
    expect(created.toJSON()).not.toHaveProperty("channels");
    expect(await client.channels.get("20")).toBeInstanceOf(Channel);
    expect((await client.members.get("10", user.id))?.user?.id).toBe(user.id);
  });

  test("GIVEN GUILD_MEMBER_UPDATE THEN the new member is merged with the cached one", async () => {
    const client = createClient();
    const calls = record(client, "guildMemberUpdate");

    await dispatch(client, GatewayDispatchEvents.GuildCreate, guild);
    await dispatch(client, GatewayDispatchEvents.GuildMemberUpdate, {
      guild_id: "10",
      user,
      roles: ["1"],
      nick: "alpha",
    });

    const [[previous, current]] = calls;
    expect(previous?.nickname).toBeNull();
    expect(current.nickname).toBe("alpha");
    expect(current.displayName).toBe("alpha");
    expect(current.joinedTimestamp).toBe(Date.parse("2024-01-01T00:00:00.000Z"));
  });

  test("GIVEN INTERACTION_CREATE THEN only raw is emitted", async () => {
    const client = createClient();
    const raw = record(client, "raw");
    const emit = vi.spyOn(client, "emit");

    await dispatch(client, GatewayDispatchEvents.InteractionCreate, { id: "1" });

    expect(raw).toHaveLength(1);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  test("GIVEN no cache THEN events still carry structures, without previous state", async () => {
    const client = createClient(null);
    const calls = record(client, "messageUpdate");

    await dispatch(client, GatewayDispatchEvents.MessageCreate, message("30", "before"));
    await dispatch(client, GatewayDispatchEvents.MessageUpdate, message("30", "after"));

    const [[previous, current]] = calls;
    expect(previous).toBeNull();
    expect(current.content).toBe("after");
    expect(await client.messages.get("20", "30")).toBeUndefined();
  });

  test("GIVEN a failing cache THEN the error is emitted and later dispatches still run", async () => {
    const cache = createInMemoryCache();
    vi.spyOn(cache.messages, "set").mockImplementationOnce(() => {
      throw new Error("boom");
    });
    const client = createClient(cache);
    const errors = record(client, "error");
    const calls = record(client, "messageCreate");

    await dispatch(client, GatewayDispatchEvents.MessageCreate, message("30", "lost"));
    await dispatch(client, GatewayDispatchEvents.MessageCreate, message("31", "kept"));

    expect(errors).toHaveLength(1);
    expect(calls.map(([emitted]) => emitted.content)).toEqual(["kept"]);
  });

  test("GIVEN a failing cache and no error listener THEN the error is logged and the shard keeps going", async () => {
    const cache = createInMemoryCache();
    vi.spyOn(cache.messages, "set").mockImplementationOnce(() => {
      throw new Error("boom");
    });
    const client = createClient(cache);
    const log = vi.spyOn(client.logger, "error").mockImplementation(() => undefined);
    const calls = record(client, "messageCreate");

    await dispatch(client, GatewayDispatchEvents.MessageCreate, message("30", "lost"));
    await dispatch(client, GatewayDispatchEvents.MessageCreate, message("31", "kept"));

    expect(log).toHaveBeenCalledOnce();
    expect(calls.map(([emitted]) => emitted.content)).toEqual(["kept"]);
  });

  test("GIVEN an asynchronous cache THEN dispatches of a shard are processed in order", async () => {
    const cache = createInMemoryCache();
    const set = cache.messages.set.bind(cache.messages);
    let delay = 20;
    vi.spyOn(cache.messages, "set").mockImplementation(async (key, value) => {
      // The first write is the slowest one: without the queue it would complete last.
      await new Promise((resolve) => setTimeout(resolve, (delay -= 10)));
      set(key, value);
    });
    const client = createClient(cache);
    const calls = record(client, "messageCreate");

    client.gateway.emit(
      WebSocketShardEvents.Dispatch,
      {
        op: GatewayOpcodes.Dispatch,
        s: 1,
        t: GatewayDispatchEvents.MessageCreate,
        d: message("30", "first"),
      } as GatewayDispatchPayload,
      0,
    );
    client.gateway.emit(
      WebSocketShardEvents.Dispatch,
      {
        op: GatewayOpcodes.Dispatch,
        s: 2,
        t: GatewayDispatchEvents.MessageCreate,
        d: message("31", "second"),
      } as GatewayDispatchPayload,
      0,
    );
    await client.idle();

    expect(calls.map(([emitted]) => emitted.content)).toEqual(["first", "second"]);
  });
});

describe("CachedManager", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("GIVEN a cache miss THEN fetch hits the API once and caches the result", async () => {
    const client = createClient();
    const get = vi.spyOn(container.rest, "get").mockResolvedValue(user);

    const first = await client.users.fetch(user.id);
    const second = await client.users.fetch(user.id);

    expect(first).toBeInstanceOf(User);
    expect(second.username).toBe("wolf");
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith(`/users/${user.id}`);
  });

  test("GIVEN refresh THEN the API is always hit", async () => {
    const client = createClient();
    const get = vi.spyOn(container.rest, "get").mockResolvedValue(user);

    await client.users.refresh(user.id);
    await client.users.refresh(user.id);

    expect(get).toHaveBeenCalledTimes(2);
  });

  test("GIVEN a guild member fetch THEN the guild ID is added to the cached data", async () => {
    const client = createClient();
    vi.spyOn(container.rest, "get").mockResolvedValue({ user, roles: [], joined_at: null });

    const member = await client.members.fetch("10", user.id);

    expect(member.guildId).toBe("10");
    expect(await client.cache!.members.get(`10:${user.id}`)).toMatchObject({ guild_id: "10" });
  });
});
