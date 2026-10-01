import { WebSocketShardEvents } from "@discordjs/ws";
import {
  createInMemoryCache,
  MemoryEntityCache,
  type Cache as PluginCache,
} from "@wolfstar/plugin-cache";
import {
  ChannelType,
  GatewayDispatchEvents,
  GatewayOpcodes,
  type APIUser,
  type GatewayDispatchPayload,
} from "discord-api-types/v10";
import { describe, expect, test } from "vitest";
import {
  BaseManager,
  CachedManager,
  CollectionCache,
  DataManager,
  EntityStoreCache,
  GatewayClient,
  GatewayErrorCodes,
  kClone,
  NullCache,
  User,
  type CacheConstructor,
  type TextChannel,
  type GatewayClientOptions,
} from "../src/index.js";

const guildId = "100000000000000010";
const user: APIUser = {
  id: "600000000000000600",
  username: "wolf",
  discriminator: "0",
  global_name: "Wolf",
  avatar: null,
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

async function dispatch(client: GatewayClient, t: GatewayDispatchEvents, d: unknown) {
  const payload = { op: GatewayOpcodes.Dispatch, s: 1, t, d } as GatewayDispatchPayload;
  client.gateway.emit(WebSocketShardEvents.Dispatch, payload, 0);
  await client.idle();
}

describe("GatewayClient cache resolution", () => {
  test("GIVEN no cache option THEN every manager gets a CollectionCache", () => {
    const client = createClient();

    expect(client.users.cache).toBeInstanceOf(CollectionCache);
    expect(client.members.cache).toBeInstanceOf(CollectionCache);
    expect(client.cache?.users).toBeDefined();
  });

  test("GIVEN cache null THEN nothing is cached", () => {
    const client = createClient({ cache: null });

    expect(client.users.cache).toBeInstanceOf(NullCache);
    expect(client.cache).toBeUndefined();
  });

  test("GIVEN a plugin-cache cache THEN managers view its stores", async () => {
    const cache: PluginCache = createInMemoryCache({ entities: ["users"] });
    const client = createClient({ cache });

    expect(client.users.cache).toBeInstanceOf(EntityStoreCache);
    expect(client.guilds.cache).toBeInstanceOf(NullCache);
    await cache.users!.set(user.id, user);
    expect((await client.users.cache.get(user.id))?.username).toBe("wolf");
  });

  test("GIVEN makeCache THEN it selects the stores", () => {
    const client = createClient({
      makeCache: (entity) => (entity === "users" ? new MemoryEntityCache() : null),
    });

    expect(client.users.cache).toBeInstanceOf(EntityStoreCache);
    expect(client.guilds.cache).toBeInstanceOf(NullCache);
  });

  test("GIVEN a makeCache caching nothing THEN nothing is cached, rather than everything by default", () => {
    const client = createClient({ makeCache: () => null });

    expect(client.users.cache).toBeInstanceOf(NullCache);
    expect(client.cache).toBeUndefined();
    expect(() =>
      createClient({ cacheConstructor: CollectionCache as never, makeCache: () => null }),
    ).toThrow(expect.objectContaining({ code: GatewayErrorCodes.ClientCacheConflict }));
  });

  test("GIVEN a cacheConstructor THEN it builds every manager cache", () => {
    class Custom extends CollectionCache<never> {}
    const client = createClient({ cacheConstructor: Custom as unknown as CacheConstructor });

    expect(client.users.cache).toBeInstanceOf(Custom);
  });

  test("GIVEN cacheConstructor with cache THEN the client refuses to start", () => {
    expect(() =>
      createClient({ cacheConstructor: CollectionCache as never, cache: createInMemoryCache() }),
    ).toThrow(expect.objectContaining({ code: GatewayErrorCodes.ClientCacheConflict }));
  });

  test("GIVEN guild-scoped managers THEN they share one cache per entity", () => {
    const client = createClient();

    expect(client.guilds.emojis(guildId).cache).toBe(client.guilds.emojis("2").cache);
    expect(client.CacheConstructor(() => new User(user), "users")).toBe(client.users.cache);
  });

  test("GIVEN the hierarchy THEN managers extend BaseManager, DataManager, and CachedManager", () => {
    const client = createClient();

    expect(client.users).toBeInstanceOf(CachedManager);
    expect(client.users).toBeInstanceOf(DataManager);
    expect(client.users).toBeInstanceOf(BaseManager);
    expect(client.webhooks).toBeInstanceOf(BaseManager);
    expect(client.webhooks).not.toBeInstanceOf(DataManager);
  });
});

describe("instance identity", () => {
  test("GIVEN _add twice THEN the cached instance is patched", async () => {
    const client = createClient();

    const first = await client.users._add(user);
    const second = await client.users._add({ ...user, username: "howl" });

    expect(second).toBe(first);
    expect(client.users.cache.get(user.id)).toBe(first);
    expect(first.username).toBe("howl");
  });

  test("GIVEN _add with cache false THEN a patched clone is returned and the cache untouched", async () => {
    const client = createClient();
    const cached = await client.users._add(user);

    const clone = await client.users._add({ ...user, username: "howl" }, false);

    expect(clone).not.toBe(cached);
    expect(clone.username).toBe("howl");
    expect(cached.username).toBe("wolf");
  });

  test("GIVEN _add changing a relation THEN the returned structure resolves the new one", async () => {
    const client = createClient();
    const category = { type: ChannelType.GuildCategory, guild_id: guildId } as const;
    const text = { id: "30", type: ChannelType.GuildText, name: "den", guild_id: guildId } as const;
    await client.channels._add({ ...category, id: "10", name: "north" } as never);
    await client.channels._add({ ...category, id: "20", name: "south" } as never);
    const cached = (await client.channels._add({
      ...text,
      parent_id: "10",
    } as never)) as TextChannel;
    expect(cached.parent?.name).toBe("north");

    const clone = await client.channels._add({ ...text, parent_id: "20" } as never, false);
    expect((clone as TextChannel).parent?.name).toBe("south");
    expect(cached.parent?.name).toBe("north");

    const moved = await client.channels._add({ ...text, parent_id: "20" } as never);
    expect(moved).toBe(cached);
    expect(cached.parent?.name).toBe("south");
  });

  test("GIVEN a dispatch THEN the cached instance is patched in place", async () => {
    const client = createClient();
    const cached = await client.users._add(user);

    await dispatch(client, GatewayDispatchEvents.UserUpdate, { ...user, username: "howl" });

    expect(client.users.cache.get(user.id)).toBe(cached);
    expect(cached.username).toBe("howl");
  });

  test("GIVEN an update dispatch THEN the event receives the previous state as a separate object", async () => {
    const client = createClient();
    await client.users._add(user);
    const seen: [string | undefined, string][] = [];
    client.on("userUpdate", (old, updated) => seen.push([old?.username, updated.username]));

    await dispatch(client, GatewayDispatchEvents.UserUpdate, { ...user, username: "howl" });

    expect(seen).toEqual([["wolf", "howl"]]);
  });

  test("GIVEN resolve and resolveId THEN they follow discord.js", async () => {
    const client = createClient();
    const cached = await client.users._add(user);

    expect(await client.users.resolve(cached)).toBe(cached);
    expect(await client.users.resolve(user.id)).toBe(cached);
    expect(await client.users.resolve("missing")).toBeNull();
    expect(client.users.resolveId(cached)).toBe(user.id);
    expect(client.users.resolveId(user.id)).toBe(user.id);
    expect(client.users.resolveId(null as never)).toBeNull();
    expect(cached[kClone]()).not.toBe(cached);
  });
});
