import { createInMemoryCache, MemoryEntityCache, type EntityCache } from "@wolfstar/plugin-cache";
import { ChannelType, GuildWidgetStyle } from "discord-api-types/v10";
import { describe, expect, test } from "vitest";
import { GatewayClient, GatewayErrorCodes, type GatewayClientOptions } from "../src/index.js";

const botId = "266624760782258186";
const guildId = "10";
const otherGuildId = "11";
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

describe.each(modes)("guild manager methods with %s", (_name, create) => {
  test("GIVEN channels THEN channelCountWithoutThreads counts those of the guild", async () => {
    const client = create();
    await client.channels._add({
      id: "40",
      type: ChannelType.GuildText,
      guild_id: guildId,
    } as never);
    await client.channels._add({
      id: "41",
      type: ChannelType.GuildCategory,
      guild_id: guildId,
    } as never);
    await client.channels._add({
      id: "42",
      type: ChannelType.GuildText,
      guild_id: otherGuildId,
    } as never);

    expect(await client.guilds.channels(guildId).channelCountWithoutThreads).toBe(2);
    expect(await client.guilds.channels(otherGuildId).channelCountWithoutThreads).toBe(1);
    expect(await client.guilds.channels("12").channelCountWithoutThreads).toBe(0);
  });

  test("GIVEN a manager THEN valueOf is its cache", () => {
    const client = create();

    expect(client.channels.valueOf()).toBe(client.channels.cache);
    expect(client.guilds.emojis(guildId).valueOf()).toBe(client.guilds.emojis(guildId).cache);
    const members = client.guilds.members(guildId);
    expect(members.valueOf()).toBe(members.cache);
  });
});

describe("channelCountWithoutThreads", () => {
  test("GIVEN threads in the channel store THEN they are not counted", async () => {
    const client = createClient();
    await client.cache!.channels!.set("40", {
      id: "40",
      type: ChannelType.GuildText,
      guild_id: guildId,
    } as never);
    await client.cache!.channels!.set("43", {
      id: "43",
      type: ChannelType.PublicThread,
      guild_id: guildId,
    } as never);

    expect(client.guilds.channels(guildId).channelCountWithoutThreads).toBe(1);
  });

  test("GIVEN a synchronous cache THEN the count is synchronous", async () => {
    const client = createClient();
    await client.channels._add({
      id: "40",
      type: ChannelType.GuildText,
      guild_id: guildId,
    } as never);

    expect(client.guilds.channels(guildId).channelCountWithoutThreads).toBe(1);
  });

  test("GIVEN a store that cannot enumerate THEN the count throws", () => {
    const client = createClient({
      cache: undefined,
      makeCache: () => {
        const store = asynchronousStore() as any;
        delete store.keys;
        delete store.values;
        return store;
      },
    });

    expect(() => client.guilds.channels(guildId).channelCountWithoutThreads).toThrow(
      expect.objectContaining({ code: "CacheNotIterable" }),
    );
  });

  test("GIVEN no channel cache THEN the count is 0", () => {
    const client = createClient({ cache: createInMemoryCache({ entities: ["users"] }) });

    expect(client.guilds.channels(guildId).channelCountWithoutThreads).toBe(0);
  });
});

describe("GuildEmojiManager#resolveIdentifier", () => {
  test("GIVEN a cached emoji or its ID THEN the identifier is the one reactions expect", async () => {
    const client = createClient();
    const emojis = client.guilds.emojis(guildId);
    const cached = await emojis._add({
      id: "70000000000000007",
      name: "howl",
      guild_id: guildId,
    } as never);

    expect(await emojis.resolveIdentifier(cached)).toBe("howl:70000000000000007");
    expect(await emojis.resolveIdentifier("70000000000000007")).toBe("howl:70000000000000007");
    expect(await emojis.resolveIdentifier("70000000000000008")).toBeNull();
    expect(
      await client.guilds.emojis(otherGuildId).resolveIdentifier("70000000000000007"),
    ).toBeNull();
  });

  test("GIVEN a Unicode emoji or a mention THEN it is resolved like a reaction emoji", async () => {
    const emojis = createClient().guilds.emojis(guildId);

    expect(await emojis.resolveIdentifier("🐺")).toBe(encodeURIComponent("🐺"));
    expect(await emojis.resolveIdentifier("<a:howl:70000000000000007>")).toBe(
      "a:howl:70000000000000007",
    );
    expect(() => emojis.resolveIdentifier("")).toThrow(
      expect.objectContaining({ code: GatewayErrorCodes.EmojiEmpty }),
    );
  });

  test("GIVEN an asynchronous cache THEN an ID resolves through a promise", async () => {
    const client = createClient({ cache: undefined, makeCache: () => asynchronousStore() });
    const emojis = client.guilds.emojis(guildId);
    await emojis._add({ id: "70000000000000007", name: "howl", guild_id: guildId } as never);

    await expect(emojis.resolveIdentifier("70000000000000007")).resolves.toBe(
      "howl:70000000000000007",
    );
  });
});

describe("GuildManager#widgetImageURL", () => {
  test("GIVEN a guild, a resolvable or an ID THEN the widget image URL is built", async () => {
    const client = createClient();
    await client.guilds._add({ id: guildId, name: "Pack", owner_id: "500" } as never);
    const guild = (await client.guilds.cache.get(guildId))!;
    const base = `https://discord.com/api/v10/guilds/${guildId}/widget.png`;

    expect(client.guilds.widgetImageURL(guildId)).toBe(`${base}?style=${GuildWidgetStyle.Shield}`);
    expect(client.guilds.widgetImageURL(guild, GuildWidgetStyle.Banner2)).toBe(
      `${base}?style=${GuildWidgetStyle.Banner2}`,
    );
  });

  test("GIVEN a resolvable carrying a guild ID THEN the URL is the one of that guild", () => {
    const client = createClient();
    expect(client.guilds.widgetImageURL({ guildId } as never)).toContain(
      `/guilds/${guildId}/widget.png`,
    );
  });

  test("GIVEN a value without a guild THEN it throws", () => {
    const client = createClient();

    expect(() => client.guilds.widgetImageURL({ guildId: null } as never)).toThrow(
      expect.objectContaining({ code: GatewayErrorCodes.GuildResolve }),
    );
  });
});
