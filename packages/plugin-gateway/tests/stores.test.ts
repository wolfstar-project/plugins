import { WebSocketShardEvents } from "@discordjs/ws";
import { container } from "@wolfstar/http-framework";
import { createInMemoryCache, createRedisCache, type Cache } from "@wolfstar/plugin-cache";
import {
  ChannelType,
  GatewayDispatchEvents,
  GatewayOpcodes,
  type APIUser,
  type GatewayDispatchPayload,
} from "discord-api-types/v10";
import { afterEach, describe, expect, test, vi } from "vitest";
import { FakeRedis } from "../../../tests/fixtures/FakeRedis.js";
import { GatewayClient, type GatewayEventMap, type GatewayEventName } from "../src/index.js";

const user: APIUser = {
  id: "266624760782258186",
  username: "wolf",
  discriminator: "0",
  global_name: null,
  avatar: null,
};

function createClient(cache: Cache) {
  return new GatewayClient({
    discordPublicKey: "0".repeat(64),
    discordToken: "test-token",
    clientId: "266624760782258186",
    intents: 0,
    cache,
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

function message(id: string, content: string) {
  return {
    id,
    channel_id: "20",
    guild_id: "10",
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

const guild = {
  id: "10",
  name: "Pack",
  roles: [{ id: "100", name: "@everyone", permissions: "0" }],
  emojis: [],
  stickers: [],
  features: [],
  channels: [{ id: "20", type: ChannelType.GuildText, name: "general" }],
  threads: [],
  members: [{ user, roles: [], joined_at: "2024-01-01T00:00:00.000Z" }],
  presences: [],
  voice_states: [],
  stage_instances: [],
  guild_scheduled_events: [],
  soundboard_sounds: [],
};

// Every manager behaviour must be the same whatever the store, per #55's first acceptance check.
describe.each([
  ["memory", () => createInMemoryCache()],
  [
    "redis",
    () =>
      createRedisCache({ redis: new FakeRedis(), compression: "gzip", compressionThreshold: 0 }),
  ],
] as const)("managers with the %s store", (_name, createCache) => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("GIVEN GUILD_CREATE THEN the guild and its collections resolve through the managers", async () => {
    const client = createClient(createCache());

    await dispatch(client, GatewayDispatchEvents.GuildCreate, guild);

    expect((await client.guilds.get("10"))?.name).toBe("Pack");
    expect((await client.channels.get("20"))?.id).toBe("20");
    expect((await client.members.get("10", user.id))?.user?.id).toBe(user.id);
    expect((await client.roles.get("10", "100"))?.name).toBe("@everyone");
    expect((await client.users.get(user.id))?.username).toBe("wolf");
  });

  test("GIVEN a message update and delete THEN old state comes from the store and the entry is dropped", async () => {
    const client = createClient(createCache());
    const updates = record(client, "messageUpdate");
    const deletes = record(client, "messageDelete");

    await dispatch(client, GatewayDispatchEvents.MessageCreate, message("30", "before"));
    await dispatch(client, GatewayDispatchEvents.MessageUpdate, message("30", "after"));
    await dispatch(client, GatewayDispatchEvents.MessageDelete, { id: "30", channel_id: "20" });

    expect(updates[0]![0]?.content).toBe("before");
    expect(updates[0]![1].content).toBe("after");
    expect(deletes[0]![0]?.content).toBe("after");
    expect(await client.messages.get("20", "30")).toBeUndefined();
  });

  test("GIVEN a partial member update THEN fields it omits are kept", async () => {
    const client = createClient(createCache());
    const calls = record(client, "guildMemberUpdate");

    await dispatch(client, GatewayDispatchEvents.GuildCreate, guild);
    await dispatch(client, GatewayDispatchEvents.GuildMemberUpdate, {
      guild_id: "10",
      user,
      roles: ["100"],
      nick: "alpha",
    });

    const [[, current]] = calls;
    expect(current.nickname).toBe("alpha");
    expect(current.joinedTimestamp).toBe(Date.parse("2024-01-01T00:00:00.000Z"));
  });

  test("GIVEN a cache miss THEN fetch falls back to REST once and stores the result", async () => {
    const client = createClient(createCache());
    const get = vi.spyOn(container.rest, "get").mockResolvedValue(user);

    await client.users.fetch(user.id);
    const cached = await client.users.fetch(user.id);

    expect(cached.username).toBe("wolf");
    expect(get).toHaveBeenCalledTimes(1);
  });

  test("GIVEN GUILD_DELETE THEN guild-scoped entities are dropped from the store", async () => {
    const client = createClient(createCache());

    await dispatch(client, GatewayDispatchEvents.GuildCreate, guild);
    await dispatch(client, GatewayDispatchEvents.GuildDelete, { id: "10" });

    expect(await client.guilds.get("10")).toBeUndefined();
    expect(await client.members.get("10", user.id)).toBeUndefined();
    expect(await client.channels.get("20")).toBeUndefined();
    expect(await client.users.get(user.id)).toBeDefined();
  });
});

describe("managers with an unreachable Redis", () => {
  test("GIVEN an outage THEN the dispatch surfaces an error and later ones still run", async () => {
    const redis = new FakeRedis();
    const client = createClient(createRedisCache({ redis }));
    const errors = record(client, "error");
    const created = record(client, "messageCreate");

    redis.failure = new Error("ECONNREFUSED");
    await dispatch(client, GatewayDispatchEvents.MessageCreate, message("30", "lost"));
    redis.failure = null;
    await dispatch(client, GatewayDispatchEvents.MessageCreate, message("31", "kept"));

    expect(errors).toHaveLength(1);
    expect((errors[0]![0] as Error).message).toBe("ECONNREFUSED");
    expect(created.map(([emitted]) => emitted.content)).toEqual(["kept"]);
    await expect(client.messages.get("20", "31")).resolves.toBeDefined();
  });
});
