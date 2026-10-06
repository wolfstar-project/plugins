import { createInMemoryCache, MemoryEntityCache, type EntityCache } from "@wolfstar/plugin-cache";
import { ChannelType } from "discord-api-types/v10";
import { describe, expect, test, vi } from "vitest";
import {
  CategoryChannel,
  CategoryChannelChildManager,
  GatewayClient,
  PollAnswer,
  PollAnswerVoterManager,
  type GatewayClientOptions,
} from "../src/index.js";

const botId = "266624760782258186";
const guildId = "10";
const categoryId = "40";
const clientSymbol = Symbol.for("wolfstar.structures.client") as never;

function createClient(options: Partial<GatewayClientOptions> = {}) {
  return new GatewayClient({
    discordPublicKey: "0".repeat(64),
    discordToken: "test-token",
    clientId: botId,
    intents: 0,
    shardCount: 1,
    cache: createInMemoryCache(),
    ...options,
  });
}

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

const modes = [
  ["a synchronous cache", () => createClient()],
  ["the default cache of instances", () => createClient({ cache: undefined })],
  [
    "an asynchronous cache",
    () => createClient({ cache: undefined, makeCache: () => asynchronousStore() }),
  ],
] as const;

async function seed(client: GatewayClient) {
  const category = (await client.channels._add({
    id: categoryId,
    type: ChannelType.GuildCategory,
    guild_id: guildId,
  } as never)) as CategoryChannel;
  await client.channels._add({
    id: "41",
    type: ChannelType.GuildText,
    guild_id: guildId,
    parent_id: categoryId,
  } as never);
  await client.channels._add({
    id: "42",
    type: ChannelType.GuildVoice,
    guild_id: guildId,
    parent_id: categoryId,
  } as never);
  await client.channels._add({
    id: "43",
    type: ChannelType.GuildText,
    guild_id: guildId,
    parent_id: "49",
  } as never);
  await client.channels._add({
    id: "44",
    type: ChannelType.GuildText,
    guild_id: guildId,
  } as never);
  await client.channels._add({
    id: "45",
    type: ChannelType.GuildText,
    guild_id: "11",
    parent_id: categoryId,
  } as never);
  return category;
}

describe.each(modes)("category.children with %s", (_name, create) => {
  test("GIVEN channels THEN cache holds those of the category only", async () => {
    const client = create();
    const category = await seed(client);

    expect(category).toBeInstanceOf(CategoryChannel);
    expect(category.children).toBeInstanceOf(CategoryChannelChildManager);
    const cache = await category.children.cache;
    expect([...cache.keys()].toSorted()).toEqual(["41", "42"]);
    expect(cache.get("41")?.id).toBe("41");
    expect([...(await category.children.valueOf()).keys()].toSorted()).toEqual(["41", "42"]);
  });

  test("GIVEN a channel THEN resolve finds it in the category only", async () => {
    const client = create();
    const category = await seed(client);
    const { children } = category;

    expect((await children.resolve("41"))?.id).toBe("41");
    expect((await children.resolve({ id: "42" }))?.id).toBe("42");
    expect(await children.resolve("43")).toBeNull();
    expect(await children.resolve("999")).toBeNull();
    expect(children.resolveId({ id: "41" })).toBe("41");
  });

  test("GIVEN a child created THEN it is sent with the category as parent", async () => {
    const client = create();
    const category = await seed(client);
    const createChannel = vi.spyOn(client.api.guilds, "createChannel").mockResolvedValue({
      id: "50",
      type: ChannelType.GuildText,
      guild_id: guildId,
      parent_id: categoryId,
      name: "howl",
    } as never);

    const created = await category.children.create({ name: "howl", topic: "awoo" });

    expect(createChannel).toHaveBeenCalledWith(
      guildId,
      expect.objectContaining({ name: "howl", topic: "awoo", parent_id: categoryId }),
      expect.anything(),
    );
    expect(created.id).toBe("50");
    expect([...(await category.children.cache).keys()].toSorted()).toEqual(["41", "42", "50"]);
  });

  test("GIVEN a category as type THEN create rejects without a request", async () => {
    const client = create();
    const category = await seed(client);
    const createChannel = vi.spyOn(client.api.guilds, "createChannel");

    await expect(
      category.children.create({ name: "nested", type: ChannelType.GuildCategory as never }),
    ).rejects.toMatchObject({ code: "CategoryChildCategory" });
    expect(createChannel).not.toHaveBeenCalled();
  });
});

describe("category.children cache", () => {
  test("GIVEN a synchronous cache THEN the cache is synchronous", async () => {
    const client = createClient();
    const category = await seed(client);

    expect(category.children.cache.size).toBe(2);
  });

  test("GIVEN a store that cannot enumerate THEN reading the cache throws", async () => {
    const client = createClient({
      cache: undefined,
      makeCache: () => {
        const store = asynchronousStore() as any;
        delete store.keys;
        delete store.values;
        return store;
      },
    });
    const category = (await client.channels._add({
      id: categoryId,
      type: ChannelType.GuildCategory,
      guild_id: guildId,
    } as never)) as CategoryChannel;

    expect(() => category.children.cache).toThrow(
      expect.objectContaining({ code: "CacheNotIterable" }),
    );
  });

  test("GIVEN no channel cache THEN the cache is empty", () => {
    const client = createClient({ cache: createInMemoryCache({ entities: ["users"] }) });
    const category = new CategoryChannel({
      id: categoryId,
      type: ChannelType.GuildCategory,
      guild_id: guildId,
    } as never);
    (category as any)[clientSymbol] = client;

    expect(category.children.cache.size).toBe(0);
  });

  test("GIVEN a category without a guild THEN the cache is empty and create rejects", async () => {
    const client = createClient();
    const category = new CategoryChannel({
      id: categoryId,
      type: ChannelType.GuildCategory,
    } as never);
    (category as any)[clientSymbol] = client;

    expect(category.children.cache.size).toBe(0);
    await expect(category.children.create({ name: "howl" })).rejects.toMatchObject({
      code: "GuildResolve",
    });
  });
});

describe("answer.voters", () => {
  const data = {
    answer_id: 2,
    poll_media: { text: "Awoo" },
    channel_id: "60",
    message_id: "61",
  };

  test("GIVEN an answer THEN voters.fetch lists the users and caches them", async () => {
    const client = createClient();
    const answer = new PollAnswer(data as never);
    (answer as any)[clientSymbol] = client;
    const getAnswerVoters = vi.spyOn(client.api.poll, "getAnswerVoters").mockResolvedValue({
      users: [{ id: "70", username: "howl" }],
    } as never);

    expect(answer.voters).toBeInstanceOf(PollAnswerVoterManager);
    expect(answer.voters.answer).toBe(answer);
    const users = await answer.voters.fetch({ limit: 5, after: "69" });

    expect(getAnswerVoters).toHaveBeenCalledWith("60", "61", 2, { limit: 5, after: "69" });
    expect(users.map((user) => user.id)).toEqual(["70"]);
    expect((await client.users.cache.get("70"))?.username).toBe("howl");
  });

  test("GIVEN fetchVoters THEN it goes through the voters manager", async () => {
    const client = createClient();
    const answer = new PollAnswer(data as never);
    (answer as any)[clientSymbol] = client;
    const getAnswerVoters = vi
      .spyOn(client.api.poll, "getAnswerVoters")
      .mockResolvedValue({ users: [] } as never);

    expect(await answer.fetchVoters()).toEqual([]);
    expect(getAnswerVoters).toHaveBeenCalledWith("60", "61", 2, {});
  });
});
