import { WebSocketShardEvents } from "@discordjs/ws";
import {
  CacheEntityNames,
  createInMemoryCache,
  MemoryEntityCache,
  type CacheFactory,
  type CachePolicies,
  type Cache,
} from "@wolfstar/plugin-cache";
import {
  ChannelType,
  GatewayDispatchEvents,
  GatewayOpcodes,
  type APIUser,
  type GatewayDispatchPayload,
} from "discord-api-types/v10";
import { describe, expect, test, vi } from "vitest";
import { GatewayClient, GatewayEvents } from "../src/index.js";

const user: APIUser = {
  id: "600000000000000600",
  username: "wolf",
  discriminator: "0",
  global_name: null,
  avatar: null,
};
const bot: APIUser = { ...user, id: "600000000000000601", username: "beep", bot: true };

function createClient(options: {
  cache?: Cache;
  makeCache?: CacheFactory;
  policies?: CachePolicies;
}) {
  return new GatewayClient({
    discordPublicKey: "0".repeat(64),
    discordToken: "test-token",
    clientId: "266624760782258186",
    intents: 0,
    ...options,
  });
}

async function dispatch(client: GatewayClient, t: GatewayDispatchEvents, d: unknown) {
  const payload = { op: GatewayOpcodes.Dispatch, s: 1, t, d } as GatewayDispatchPayload;
  client.gateway.emit(WebSocketShardEvents.Dispatch, payload, 0);
  await client.idle();
}

describe("makeCache", () => {
  test("GIVEN a factory THEN it is called once per entity kind, at construction", () => {
    const makeCache = vi.fn<CacheFactory>(() => new MemoryEntityCache());

    const client = createClient({ makeCache });
    void client.guilds.emojis("10").cache;
    void client.guilds.emojis("11").cache;

    expect(makeCache).toHaveBeenCalledTimes(CacheEntityNames.length);
    expect(new Set(makeCache.mock.calls.map(([entity]) => entity)).size).toBe(
      CacheEntityNames.length,
    );
  });

  test("GIVEN a factory returning null for an entity THEN that entity is not cached", async () => {
    const client = createClient({
      makeCache: (entity) => (entity === "members" ? null : new MemoryEntityCache()),
    });

    await dispatch(client, GatewayDispatchEvents.GuildMemberAdd, {
      guild_id: "10",
      user,
      roles: [],
      joined_at: "2024-01-01T00:00:00.000Z",
      deaf: false,
      mute: false,
      flags: 0,
    });

    expect(client.members.cache).toBeUndefined();
    expect(client.cache?.members).toBeUndefined();
    expect(await client.users.get(user.id)).toBeDefined();
    expect(await client.members.get("10", user.id)).toBeUndefined();
  });

  test("GIVEN a factory caching nothing THEN the client has no cache", () => {
    expect(createClient({ makeCache: () => null }).cache).toBeUndefined();
  });

  test("GIVEN both a factory and a cache THEN the factory wins", () => {
    const users = new MemoryEntityCache();
    const client = createClient({
      cache: createInMemoryCache(),
      makeCache: (entity) => (entity === "users" ? users : null),
    });

    expect(client.users.cache).toBe(users);
    expect(client.guilds.cache).toBeUndefined();
  });
});

describe("policies", () => {
  test("GIVEN a policy with a cache THEN dispatches follow it", async () => {
    const client = createClient({
      cache: createInMemoryCache(),
      policies: { users: { filter: (value) => !value.bot } },
    });

    await dispatch(client, GatewayDispatchEvents.GuildCreate, {
      id: "10",
      name: "Pack",
      channels: [{ id: "20", type: ChannelType.GuildText, name: "general" }],
      members: [user, bot].map((member) => ({
        user: member,
        roles: [],
        joined_at: "2024-01-01T00:00:00.000Z",
        deaf: false,
        mute: false,
        flags: 0,
      })),
      roles: [],
      emojis: [],
      stickers: [],
    });

    expect(await client.users.get(user.id)).toBeDefined();
    expect(await client.users.get(bot.id)).toBeUndefined();
  });

  test("GIVEN a policy with a factory THEN manager writes follow it", async () => {
    const client = createClient({
      makeCache: () => new MemoryEntityCache(),
      policies: { users: { filter: (value) => !value.bot } },
    });

    await client.users._add(bot);
    await client.users._add(user);

    expect(await client.users.get(bot.id)).toBeUndefined();
    expect(await client.users.get(user.id)).toBeDefined();
  });
});

describe("partial caches", () => {
  test("GIVEN no guilds store THEN READY does not try to reconcile guilds", async () => {
    const client = createClient({ cache: createInMemoryCache({ entities: ["users"] }) });
    const errors = vi.fn();
    client.on(GatewayEvents.ShardError, errors);
    client.on("error", errors);

    await dispatch(client, GatewayDispatchEvents.Ready, {
      v: 10,
      user,
      guilds: [{ id: "10", unavailable: true }],
      session_id: "s",
      resume_gateway_url: "wss://gateway.discord.gg",
      application: { id: "266624760782258186", flags: 0 },
      shard: [0, 1],
    });

    expect(errors).not.toHaveBeenCalled();
  });
});
