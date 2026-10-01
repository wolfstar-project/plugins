import { container } from "@wolfstar/http-framework";
import {
  createInMemoryCache,
  createRedisCache,
  MemoryEntityCache,
  type Awaitable,
  type CacheFactory,
  type EntityCache,
  memberKey,
  messageKey,
  roleKey,
  type Cache,
} from "@wolfstar/plugin-cache";
import { ChannelType, MessageType, type APIMessage, type APIUser } from "discord-api-types/v10";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  GatewayClient,
  Guild,
  kClone,
  Message,
  StageChannel,
  TextChannel,
  User,
} from "../src/index.js";
import { FakeRedis } from "../../../tests/fixtures/FakeRedis.js";

const guildId = "100000000000000010";
const channelId = "200000000000000020";
const user: APIUser = {
  id: "600000000000000600",
  username: "wolf",
  discriminator: "0",
  global_name: "Wolf",
  avatar: null,
};

function createClient({ cache }: { cache: Cache | null } = { cache: createInMemoryCache() }) {
  return new GatewayClient({
    discordPublicKey: "0".repeat(64),
    discordToken: "test-token",
    clientId: "266624760782258186",
    intents: 0,
    cache,
  });
}

function message(extra: Partial<APIMessage> = {}): APIMessage {
  return {
    id: "1200000000000000000",
    channel_id: channelId,
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
    ...extra,
  };
}

// Unwraps what a synchronous cache answers with, which is never a promise.
function sync<Value>(value: Awaitable<Value>): Value {
  expect(value).not.toBeInstanceOf(Promise);
  return value as Value;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CachedManager#_add", () => {
  test("GIVEN a stage channel THEN the manager hydrates optimized data without changing cache false", async () => {
    const client = createClient();
    const raw = {
      id: channelId,
      type: ChannelType.GuildStageVoice,
      last_pin_timestamp: "2024-01-01T00:00:00.000Z",
    };
    const stage = await client.channels._add(raw as never);

    expect(stage).toBeInstanceOf(StageChannel);
    expect((stage as StageChannel).lastPinTimestamp).toBe(Date.parse("2024-01-01T00:00:00.000Z"));

    const updated = await client.channels._add(
      { ...raw, last_pin_timestamp: "2025-01-01T00:00:00.000Z" } as never,
      false,
    );
    expect((updated as StageChannel).lastPinTimestamp).toBe(Date.parse("2025-01-01T00:00:00.000Z"));
    expect((await client.cache!.channels.get(channelId))?.last_pin_timestamp).toBe(
      "2024-01-01T00:00:00.000Z",
    );
  });

  test("GIVEN a partial payload THEN it is merged into the cached entry", async () => {
    const client = createClient();
    await client.cache!.users.set(user.id, { ...user, banner: "banner" });

    const added = await client.users._add({ ...user, username: "howl" });

    expect(added.username).toBe("howl");
    expect(added.banner).toBe("banner");
    expect(await client.cache!.users.get(user.id)).toMatchObject({
      username: "howl",
      banner: "banner",
    });
  });

  test("GIVEN cache false THEN the merged structure is built without being written", async () => {
    const client = createClient();
    await client.cache!.users.set(user.id, { ...user, banner: "banner" });

    const added = await client.users._add({ ...user, username: "howl" }, false);

    expect(added.username).toBe("howl");
    expect(added.banner).toBe("banner");
    expect((await client.cache!.users.get(user.id))?.username).toBe("wolf");
  });

  test("GIVEN a client without cache THEN it builds the payload", async () => {
    const client = new GatewayClient({
      discordPublicKey: "0".repeat(64),
      discordToken: "test-token",
      clientId: "266624760782258186",
      intents: 0,
      cache: null,
    });

    await expect(client.users._add(user)).resolves.toBeInstanceOf(User);
  });
});

describe("DataManager#resolve", () => {
  test("GIVEN a structure, a cached key, or an unknown key THEN it resolves accordingly", async () => {
    const client = createClient();
    const structure = new User(user);
    await client.cache!.users.set(user.id, user);

    expect(await client.users.resolve(structure)).toBe(structure);
    expect((await client.users.resolve(user.id))?.username).toBe("wolf");
    expect(await client.users.resolve("1")).toBeNull();
  });
});

describe("relations", () => {
  test("GIVEN a sent message THEN its author and member come from the cache", async () => {
    const client = createClient();
    await client.cache!.users.set(user.id, { ...user, banner: "banner" });
    vi.spyOn(container.rest, "post").mockResolvedValue(
      message({
        guild_id: guildId,
        member: { roles: [], joined_at: "2026-01-01T00:00:00.000Z", nick: "Alpha" } as never,
      }),
    );

    const sent = await client.messages.send(channelId, "hello");

    expect(sent.author.banner).toBe("banner");
    expect(sent.member?.nickname).toBe("Alpha");
    expect(sent.member?.user?.banner).toBe("banner");
    expect(await client.cache!.members.get(memberKey(guildId, user.id))).toMatchObject({
      nick: "Alpha",
    });
  });

  test("GIVEN a webhook message THEN its author is not cached as a user", async () => {
    const client = createClient();
    vi.spyOn(container.rest, "post").mockResolvedValue(message({ webhook_id: "1" }));

    const sent = await client.messages.send(channelId, "hello");

    expect(sent.author.id).toBe(user.id);
    expect(await client.cache!.users.get(user.id)).toBeUndefined();
    expect(await client.cache!.messages.get(messageKey(channelId, sent.id))).toBeDefined();
  });

  test("GIVEN a cached message THEN cache.get resolves its author from the users cache", async () => {
    const client = createClient();
    await client.cache!.messages.set(messageKey(channelId, "1200000000000000000"), message());
    await client.cache!.users.set(user.id, { ...user, username: "renamed" });

    const cached = await client.messages.cache.get(
      client.messages.resolveKey(channelId, "1200000000000000000"),
    );

    expect(cached?.author.username).toBe("renamed");
  });

  test("GIVEN a fetched member THEN its user comes from the users cache", async () => {
    const client = createClient();
    await client.cache!.users.set(user.id, { ...user, banner: "banner" });
    vi.spyOn(container.rest, "get").mockResolvedValue({
      user,
      roles: [],
      joined_at: "2026-01-01T00:00:00.000Z",
    });

    const member = await client.members.fetch(guildId, user.id);

    expect(member.user?.banner).toBe("banner");
  });
});

describe("guild relations", () => {
  const guild = { id: guildId, name: "Pack", icon: null, owner_id: user.id, features: [] } as never;

  test("GIVEN a cached guild THEN structures from managers resolve it", async () => {
    const client = createClient();
    await client.cache!.guilds.set(guildId, guild);
    await client.cache!.channels.set(channelId, {
      id: channelId,
      type: ChannelType.GuildText,
      name: "general",
      guild_id: guildId,
    } as never);
    await client.cache!.roles.set(roleKey(guildId, "5"), {
      id: "5",
      name: "Alpha",
      guild_id: guildId,
    } as never);
    await client.cache!.messages.set(
      messageKey(channelId, "1200000000000000000"),
      message({ guild_id: guildId }),
    );

    const channel = await client.channels.cache.get(channelId);
    const role = await client.roles.cache.get(client.roles.resolveKey(guildId, "5"));
    const cached = await client.messages.cache.get(
      client.messages.resolveKey(channelId, "1200000000000000000"),
    );

    expect((channel as TextChannel).guild).toBeInstanceOf(Guild);
    expect(role?.guild?.name).toBe("Pack");
    expect(cached?.guild?.id).toBe(guildId);
    expect(cached?.channel).toBeInstanceOf(TextChannel);
  });

  test("GIVEN an uncached guild or a hand-built structure THEN guild is null", async () => {
    const client = createClient();
    vi.spyOn(container.rest, "get").mockResolvedValue({
      user,
      roles: [],
      joined_at: "2026-01-01T00:00:00.000Z",
    });

    const member = await client.members.fetch(guildId, user.id);

    expect(member.guild).toBeNull();
    expect(new Message(message({ guild_id: guildId })).guild).toBeNull();
  });

  test("GIVEN a clone THEN it keeps the resolved relations", async () => {
    const client = createClient();
    await client.cache!.guilds.set(guildId, guild);
    await client.cache!.roles.set(roleKey(guildId, "5"), {
      id: "5",
      name: "Alpha",
      guild_id: guildId,
    } as never);

    const role = await client.roles.cache.get(client.roles.resolveKey(guildId, "5"));

    expect(role![kClone]({ name: "Beta" }).guild?.id).toBe(guildId);
  });
});

describe("guild relations of guild assets", () => {
  const guild = { id: guildId, name: "Pack", icon: null, owner_id: user.id, features: [] } as never;

  test("GIVEN a cached guild THEN emojis, stickers, and invites resolve it", async () => {
    const client = createClient();
    await client.cache!.guilds.set(guildId, guild);
    vi.spyOn(container.rest, "get").mockImplementation(async (route: string) => {
      if (route.includes("emojis")) return { id: "7", name: "howl", roles: [] };
      if (route.includes("stickers"))
        return { id: "8", name: "wolf", tags: "wolf", type: 2, format_type: 1 };
      return { code: "wolves", type: 0, channel: null };
    });

    const emoji = await client.guilds.emojis(guildId).fetch("7");
    const sticker = await client.guilds.stickers(guildId).fetch("8");
    const invite = await client.guilds.invites(guildId).fetch("wolves");

    expect(emoji.guild).toBeInstanceOf(Guild);
    expect(sticker.guild?.id).toBe(guildId);
    expect(invite.guild).toBeInstanceOf(Guild);
  });
});

describe("CachedManager#cache", () => {
  const guild = { id: guildId, name: "Pack", icon: null, owner_id: user.id, features: [] } as never;
  const member = { user, roles: [], joined_at: "2026-01-01T00:00:00.000Z", guild_id: guildId };

  test("GIVEN an in-memory cache THEN cache.get answers synchronously, relations included", async () => {
    const client = createClient();
    await client.cache!.guilds.set(guildId, guild);
    await client.cache!.channels.set(channelId, {
      id: channelId,
      type: ChannelType.GuildText,
      name: "general",
      guild_id: guildId,
    } as never);
    await client.cache!.users.set(user.id, { ...user, username: "renamed" });
    await client.cache!.messages.set(
      messageKey(channelId, "1200000000000000000"),
      message({
        guild_id: guildId,
        member: { roles: [], joined_at: "2026-01-01T00:00:00.000Z", nick: "Alpha" } as never,
      }),
    );

    const key = client.messages.resolveKey(channelId, "1200000000000000000");
    const cached = sync(client.messages.cache.get(key));

    expect(client.messages.cache.synchronous).toBe(true);
    expect(cached).toBeInstanceOf(Message);
    expect(cached).toEqual(await client.messages.cache.get(key));
    expect(cached?.author.username).toBe("renamed");
    expect(cached?.member?.nickname).toBe("Alpha");
    expect(cached?.guild?.name).toBe("Pack");
    expect(cached?.channel).toBeInstanceOf(TextChannel);
  });

  test("GIVEN several IDs THEN resolveKey builds the key of the entity they identify", async () => {
    const client = createClient();
    await client.cache!.users.set(user.id, { ...user, banner: "banner" });
    await client.cache!.members.set(memberKey(guildId, user.id), member);
    await client.cache!.roles.set(roleKey(guildId, "5"), {
      id: "5",
      name: "Alpha",
      guild_id: guildId,
    } as never);

    const { members, roles } = client;
    expect(sync(members.cache.get(members.resolveKey(guildId, user.id)))?.user?.banner).toBe(
      "banner",
    );
    expect(sync(roles.cache.get(roles.resolveKey(guildId, "5")))?.name).toBe("Alpha");
    expect(sync(members.cache.get(members.resolveKey(guildId, "1")))).toBeUndefined();
  });

  test("GIVEN a thread ID THEN channels falls back to the thread cache", async () => {
    const client = createClient();
    const threadId = "200000000000000030";
    await client.cache!.threads.set(threadId, {
      id: threadId,
      type: ChannelType.PublicThread,
      name: "hunt",
      guild_id: guildId,
      parent_id: channelId,
    } as never);

    expect(sync(client.channels.cache.get(threadId))?.id).toBe(threadId);
    expect(sync(client.channels.cache.has(threadId))).toBe(true);
    expect(sync(client.channels.cache.get("1"))).toBeUndefined();
  });

  test("GIVEN a client without cache THEN cache.get answers undefined", () => {
    const client = createClient({ cache: null });

    expect(client.users.cache.get(user.id)).toBeUndefined();
  });

  test("GIVEN a Redis cache THEN cache.get answers with a promise", async () => {
    const client = createClient({ cache: createRedisCache({ redis: new FakeRedis() }) });
    await client.cache!.users!.set(user.id, user);

    expect(client.users.cache.synchronous).toBe(false);
    const cached = client.users.cache.get(user.id);
    expect(cached).toBeInstanceOf(Promise);
    expect((await cached)?.username).toBe("wolf");
  });
});

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

function baseStore(): EntityCache<any> {
  const inner = new MemoryEntityCache<any>();
  return {
    synchronous: true,
    get: (key) => inner.get(key),
    set: (key, value, options) => inner.set(key, value, options),
    upsert: (key, data, options) => inner.upsert(key, data, options),
    has: (key) => inner.has(key),
    delete: (key) => inner.delete(key),
    clear: () => inner.clear(),
    getSize: () => inner.getSize(),
  };
}

function clientWith(makeCache: CacheFactory, cacheErrors?: "miss" | "throw") {
  return new GatewayClient({
    discordPublicKey: "0".repeat(64),
    discordToken: "test-token",
    clientId: "266624760782258186",
    intents: 0,
    makeCache,
    cacheErrors,
  });
}

describe("RFC manager pattern", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("GIVEN a failing store THEN fetch falls back to the API and emits cacheError", async () => {
    const error = new Error("down");
    const client = clientWith((entity) => (entity === "users" ? failingStore(error) : null));
    const cacheErrors: unknown[][] = [];
    client.on("cacheError", (...args) => cacheErrors.push(args));
    vi.spyOn(container.rest, "get").mockResolvedValue(user);

    const fetched = await client.users.fetch(user.id);

    expect(fetched.id).toBe(user.id);
    // The read of `fetch`, then the read and the write of `_add`.
    expect(cacheErrors).toEqual([
      [error, { entity: "users", key: user.id, operation: "get" }],
      [error, { entity: "users", key: user.id, operation: "get" }],
      [error, { entity: "users", key: user.id, operation: "set" }],
    ]);
  });

  test("GIVEN cacheErrors throw THEN fetch rejects with the cache error", async () => {
    const error = new Error("down");
    const client = clientWith(
      (entity) => (entity === "users" ? failingStore(error) : null),
      "throw",
    );
    const cacheErrors = vi.fn();
    client.on("cacheError", cacheErrors);

    await expect(client.users.fetch(user.id)).rejects.toBe(error);
    expect(cacheErrors).toHaveBeenCalledOnce();
  });

  test("GIVEN a failing synchronous store THEN cache.get reports a miss", () => {
    const client = clientWith((entity) =>
      entity === "users" ? failingStore(new Error("down")) : null,
    );
    const cacheErrors = vi.fn();
    client.on("cacheError", cacheErrors);

    expect(client.users.cache.get(user.id)).toBeUndefined();
    expect(cacheErrors).toHaveBeenCalledOnce();
  });

  test("GIVEN a store THEN _add reads the entry once and writes it once", async () => {
    const store = new MemoryEntityCache<any>();
    const client = clientWith((entity) => (entity === "users" ? store : null));
    const set = vi.spyOn(store, "set");
    const get = vi.spyOn(store, "get");

    const added = await client.users._add(user);

    expect(added.username).toBe(user.username);
    expect(get).toHaveBeenCalledExactlyOnceWith(user.id);
    expect(set).toHaveBeenCalledExactlyOnceWith(user.id, user);
  });

  test("GIVEN listCached THEN it needs a store able to enumerate", async () => {
    const withoutStore = clientWith(() => null);
    const nonIterable = clientWith((entity) =>
      entity === "presences" || entity === "emojis" ? baseStore() : null,
    );

    await expect(withoutStore.presences.listCached(guildId)).resolves.toEqual([]);
    await expect(withoutStore.guilds.emojis(guildId).listCached()).resolves.toEqual([]);
    await expect(nonIterable.presences.listCached(guildId)).rejects.toThrow(TypeError);
    await expect(nonIterable.guilds.emojis(guildId).listCached()).rejects.toThrow(TypeError);
  });

  test("GIVEN a manager THEN cache.construct builds structures bound to its client", () => {
    const client = clientWith(() => null);

    const built = client.users.cache.construct(user);

    expect(built).toBeInstanceOf(User);
    expect(built.client).toBe(client);
  });
});
