import { WebSocketShardEvents } from "@discordjs/ws";
import { container } from "@wolfstar/http-framework";
import {
  createInMemoryCache,
  memberKey,
  MemoryEntityCache,
  messageKey,
  type Cache as PluginCache,
  type EntityCache,
} from "@wolfstar/plugin-cache";
import {
  ChannelType,
  GatewayDispatchEvents,
  GatewayOpcodes,
  MessageType,
  type APIMessage,
  type APIUser,
  type GatewayDispatchPayload,
} from "discord-api-types/v10";
import { afterEach, describe, expect, test, vi } from "vitest";
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

  test("GIVEN cacheOptions THEN maxSize bounds the cache of that entity only", async () => {
    const client = createClient({ cacheOptions: { messages: { maxSize: 2 } } });
    const channelId = "200000000000000020";

    for (const id of ["1", "2", "3"]) {
      await dispatch(client, GatewayDispatchEvents.MessageCreate, {
        id,
        channel_id: channelId,
        author: { ...user, id: `60000000000000060${id}` },
        content: id,
        timestamp: "2026-01-01T00:00:00.000Z",
        mentions: [],
        mention_roles: [],
        attachments: [],
        embeds: [],
        type: MessageType.Default,
      });
    }

    expect(client.messages.cache.getSize()).toBe(2);
    expect(client.messages.cache.get(messageKey(channelId, "1"))).toBeUndefined();
    expect(client.messages.cache.get(messageKey(channelId, "3"))?.content).toBe("3");
    // The other entities stay unbounded.
    expect(client.users.cache.getSize()).toBe(3);
  });

  test("GIVEN cacheOptions with a cacheConstructor THEN the constructor receives them next to keyOf and refresh", () => {
    const seen: Record<string, unknown>[] = [];
    class Custom extends CollectionCache<never> {
      public constructor(creator: never, name: never, options: Record<string, unknown>) {
        super(creator, name, options);
        seen.push({ name, ...options });
      }
    }
    const client = createClient({
      cacheConstructor: Custom as unknown as CacheConstructor,
      cacheOptions: { users: { maxSize: 5 } },
    });

    expect(client.users.cache).toBeInstanceOf(Custom);
    expect(client.guilds.cache).toBeInstanceOf(Custom);
    expect(seen.find((options) => options.name === "users")).toEqual({
      name: "users",
      keyOf: expect.any(Function),
      refresh: expect.any(Function),
      maxSize: 5,
    });
    expect(seen.find((options) => options.name === "guilds")).toEqual({
      name: "guilds",
      keyOf: expect.any(Function),
      refresh: expect.any(Function),
    });
  });

  test("GIVEN cacheOptions with cache or makeCache THEN the client refuses to start", () => {
    const cacheOptions = { messages: { maxSize: 2 } };

    expect(() => createClient({ cacheOptions, cache: createInMemoryCache() })).toThrow(
      expect.objectContaining({ code: GatewayErrorCodes.ClientCacheConflict }),
    );
    expect(() => createClient({ cacheOptions, makeCache: () => null })).toThrow(
      expect.objectContaining({ code: GatewayErrorCodes.ClientCacheConflict }),
    );
  });

  test("GIVEN cacheOptions or a cacheConstructor with cache null THEN nothing is cached: null wins", () => {
    const client = createClient({
      cache: null,
      cacheConstructor: CollectionCache as never,
      cacheOptions: { messages: { maxSize: 2 } },
    });

    expect(client.messages.cache).toBeInstanceOf(NullCache);
    expect(client.users.cache).toBeInstanceOf(NullCache);
    expect(client.cache).toBeUndefined();
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

  test("GIVEN two MESSAGE_CREATE from the same author THEN the cached user stays the same instance", async () => {
    const client = createClient();
    const message = {
      channel_id: "200000000000000020",
      content: "hello",
      timestamp: "2026-01-01T00:00:00.000Z",
      edited_timestamp: null,
      tts: false,
      mention_everyone: false,
      mentions: [],
      mention_roles: [],
      attachments: [],
      embeds: [],
      pinned: false,
      type: MessageType.Default,
    };

    await dispatch(client, GatewayDispatchEvents.MessageCreate, {
      ...message,
      id: "1200000000000000001",
      author: user,
    });
    const cached = client.users.cache.get(user.id);
    expect(cached).toBeInstanceOf(User);
    await dispatch(client, GatewayDispatchEvents.MessageCreate, {
      ...message,
      id: "1200000000000000002",
      author: { ...user, username: "howl" },
    });

    expect(client.users.cache.get(user.id)).toBe(cached);
    expect(cached?.username).toBe("howl");
  });

  test("GIVEN a second GUILD_CREATE THEN the guild, channel, and role instances are kept and updated", async () => {
    const client = createClient();
    const channelId = "200000000000000020";
    const roleId = "300000000000000030";
    const guild = (name: string) => ({
      id: guildId,
      name: `${name} guild`,
      channels: [{ id: channelId, type: ChannelType.GuildText, name: `${name}-channel` }],
      roles: [{ id: roleId, name: `${name} role`, permissions: "0", position: 1 }],
      members: [],
      emojis: [],
      stickers: [],
      voice_states: [],
    });

    await dispatch(client, GatewayDispatchEvents.GuildCreate, guild("old"));
    const roleKey = client.roles.resolveKey(guildId, roleId);
    const cachedGuild = client.guilds.cache.get(guildId);
    const cachedChannel = client.channels.cache.get(channelId) as TextChannel | undefined;
    const cachedRole = client.roles.cache.get(roleKey);
    expect(cachedGuild?.name).toBe("old guild");
    expect(cachedChannel?.name).toBe("old-channel");
    expect(cachedRole?.name).toBe("old role");

    await dispatch(client, GatewayDispatchEvents.GuildCreate, guild("new"));

    expect(client.guilds.cache.get(guildId)).toBe(cachedGuild);
    expect(client.channels.cache.get(channelId)).toBe(cachedChannel);
    expect(client.roles.cache.get(roleKey)).toBe(cachedRole);
    expect(cachedGuild?.name).toBe("new guild");
    expect(cachedChannel?.name).toBe("new-channel");
    expect(cachedRole?.name).toBe("new role");
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

describe("policies with caches of instances", () => {
  const bot: APIUser = { ...user, bot: true };
  const policies = { users: { filter: (value: APIUser) => !value.bot } };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("GIVEN a filtered entity added through a manager THEN it is built without being cached", async () => {
    const client = createClient({ policies });

    const added = await client.users._add(bot);

    expect(added).toBeInstanceOf(User);
    expect(added.bot).toBe(true);
    expect(client.users.cache.get(bot.id)).toBeUndefined();
    expect(client.users.cache.getSize()).toBe(0);
  });

  test("GIVEN a filtered entity fetched through a manager THEN it is not cached", async () => {
    const client = createClient({ policies });
    vi.spyOn(container.rest, "get").mockResolvedValue(bot);

    const fetched = await client.users.fetch(bot.id);

    expect(fetched.id).toBe(bot.id);
    expect(client.users.cache.get(bot.id)).toBeUndefined();
  });

  test("GIVEN an accepted entity THEN it is cached as usual", async () => {
    const client = createClient({ policies });

    const added = await client.users._add(user);

    expect(client.users.cache.get(user.id)).toBe(added);
  });

  test("GIVEN a cached entity whose update is rejected THEN it is removed", async () => {
    const client = createClient({ policies });
    const cached = await client.users._add(user);

    const updated = await client.users._add({ id: user.id, bot: true } as APIUser);

    expect(client.users.cache.get(user.id)).toBeUndefined();
    // The filter judged the update merged with the cached entry, and the structure is still returned.
    expect(updated.bot).toBe(true);
    expect(updated.username).toBe("wolf");
    expect(updated).not.toBe(cached);
  });

  test("GIVEN a cached entity whose patch is rejected THEN it is removed", async () => {
    const message = {
      id: "1200000000000000000",
      channel_id: "200000000000000020",
      author: user,
      content: "hello",
      timestamp: "2026-01-01T00:00:00.000Z",
      edited_timestamp: null,
      tts: false,
      mention_everyone: false,
      mentions: [],
      mention_roles: [],
      attachments: [],
      embeds: [],
      pinned: false,
      type: MessageType.Default,
    } as APIMessage;
    const client = createClient({
      policies: { messages: { filter: (value: APIMessage) => !value.pinned } },
    });
    const key = messageKey(message.channel_id, message.id);
    await client.messages._add(message);
    expect(client.messages.cache.get(key)).toBeDefined();

    await client.messages._patchCached(key, { pinned: true });

    expect(client.messages.cache.get(key)).toBeUndefined();
  });

  test("GIVEN a dispatch THEN it is still filtered", async () => {
    const client = createClient({ policies });

    await dispatch(client, GatewayDispatchEvents.UserUpdate, bot);
    expect(client.users.cache.get(bot.id)).toBeUndefined();

    await client.users._add(user);
    await dispatch(client, GatewayDispatchEvents.UserUpdate, bot);
    expect(client.users.cache.get(user.id)).toBeUndefined();
  });
});

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
  };
}

function failingStore(error: Error): EntityCache<any> {
  const fail = () => {
    throw error;
  };
  return {
    synchronous: true,
    get: fail,
    set: fail,
    upsert: fail,
    has: fail,
    delete: fail,
    clear: fail,
    getSize: fail,
  };
}

function clientWithFailingVoiceStates(error: Error, cacheErrors?: "miss" | "throw") {
  return createClient({
    cacheErrors,
    makeCache: (entity) =>
      entity === "voiceStates"
        ? failingStore(error)
        : entity === "members" || entity === "users"
          ? new MemoryEntityCache()
          : null,
  });
}

describe("relations read from other stores", () => {
  const member = { user, roles: [], joined_at: "2026-01-01T00:00:00.000Z", guild_id: guildId };
  const key = memberKey(guildId, user.id);

  test("GIVEN members in memory and asynchronous users THEN members.cache is not synchronous", async () => {
    const client = createClient({
      makeCache: (entity) =>
        entity === "members"
          ? new MemoryEntityCache()
          : entity === "users"
            ? asynchronousStore()
            : null,
    });
    await client.cache!.members!.set(key, member);
    await client.cache!.users!.set(user.id, { ...user, banner: "banner" });

    expect(client.members.cache.synchronous).toBe(false);
    expect(client.users.cache.synchronous).toBe(false);
    // An entity without a store builds its structures from the same stores.
    expect(client.guilds.cache.synchronous).toBe(false);
    const cached = client.members.cache.get(key);
    expect(cached).toBeInstanceOf(Promise);
    expect((await cached)?.user?.banner).toBe("banner");
  });

  test("GIVEN only synchronous stores THEN every cache is synchronous", () => {
    const client = createClient({
      makeCache: (entity) =>
        entity === "members" || entity === "users" ? new MemoryEntityCache() : null,
    });

    expect(client.members.cache.synchronous).toBe(true);
    expect(client.guilds.cache.synchronous).toBe(true);
  });

  test("GIVEN a failing relation store and cacheErrors miss THEN the structure is built without the relation", async () => {
    const error = new Error("down");
    const client = clientWithFailingVoiceStates(error);
    await client.cache!.members!.set(key, member);
    const cacheErrors: unknown[][] = [];
    client.on("cacheError", (...args) => cacheErrors.push(args));

    const cached = await client.members.cache.get(key);

    expect(cached?.user?.id).toBe(user.id);
    expect(cached?.voice).toBeNull();
    expect(cacheErrors).toEqual([[error, { entity: "voiceStates", key, operation: "get" }]]);
  });

  test("GIVEN a failing relation store and cacheErrors throw THEN the read throws", async () => {
    const error = new Error("down");
    const client = clientWithFailingVoiceStates(error, "throw");
    await client.cache!.members!.set(key, member);
    const cacheErrors = vi.fn();
    client.on("cacheError", cacheErrors);

    expect(() => client.members.cache.get(key)).toThrow(error);
    expect(cacheErrors).toHaveBeenCalledExactlyOnceWith(error, {
      entity: "voiceStates",
      key,
      operation: "get",
    });
  });

  test("GIVEN a failing store and cacheErrors miss THEN listCached answers with nothing", async () => {
    const error = new Error("down");
    const store = new MemoryEntityCache<any>();
    vi.spyOn(store, "entries").mockImplementation(() => {
      throw error;
    });
    const client = createClient({
      makeCache: (entity) => (entity === "voiceStates" ? store : null),
    });
    const cacheErrors: unknown[][] = [];
    client.on("cacheError", (...args) => cacheErrors.push(args));

    await expect(client.voiceStates.listCached(guildId)).resolves.toEqual([]);
    expect(cacheErrors).toEqual([
      [error, { entity: "voiceStates", key: null, operation: "entries" }],
    ]);
  });
});
