import { createRedisCache } from "@wolfstar/plugin-cache";
import { MessageType } from "discord-api-types/v10";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  ChannelMessageManager,
  GatewayClient,
  GuildMemberManager,
  PresenceManager,
  RoleManager,
  VoiceStateManager,
  ThreadChannelMemberManager,
  type GatewayClientOptions,
} from "../src/index.js";
import { FakeRedis } from "../../../tests/fixtures/FakeRedis.js";

const guildId = "100000000000000010";
const otherGuildId = "100000000000000011";
const channelId = "200000000000000020";
const otherChannelId = "200000000000000021";
const threadId = "700000000000000070";
const otherThreadId = "700000000000000071";
const userId = "600000000000000600";
const roleId = "300000000000000030";
const messageId = "1200000000000000000";

const user = { id: userId, username: "wolf", discriminator: "0", global_name: null, avatar: null };

const memberData = {
  user,
  roles: [],
  joined_at: "2026-01-01T00:00:00.000Z",
  deaf: false,
  mute: false,
  flags: 0,
  guild_id: guildId,
};

const roleData = {
  id: roleId,
  name: "pack",
  color: 0,
  colors: { primary_color: 0, secondary_color: null, tertiary_color: null },
  hoist: false,
  position: 1,
  permissions: "0",
  managed: false,
  mentionable: false,
  flags: 0,
  guild_id: guildId,
};

const voiceStateData = {
  guild_id: guildId,
  channel_id: channelId,
  user_id: userId,
  session_id: "session",
  deaf: false,
  mute: false,
  self_deaf: false,
  self_mute: false,
  self_video: false,
  suppress: false,
  request_to_speak_timestamp: null,
};

const messageData = {
  id: messageId,
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
};

const threadMemberData = {
  id: threadId,
  user_id: userId,
  join_timestamp: "2026-01-01T00:00:00.000Z",
  flags: 0,
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

const stores = [
  ["a synchronous cache", () => createClient(), false],
  [
    "an asynchronous cache",
    () => createClient({ cache: createRedisCache({ redis: new FakeRedis() }) }),
    true,
  ],
] as const;

// Every manager built for a parent: how to seed its entity, the manager of the parent and of another one, and the
// ID its cache takes.
const scopes = [
  {
    name: "guild.members",
    seed: (client: GatewayClient) => client.members._add(memberData as never),
    narrowed: (client: GatewayClient) => client.guilds.members(guildId),
    other: (client: GatewayClient) => client.guilds.members(otherGuildId),
    global: (client: GatewayClient) => client.members,
    scopeId: guildId,
    id: userId,
  },
  {
    name: "guild.roles",
    seed: (client: GatewayClient) => client.roles._add(roleData as never),
    narrowed: (client: GatewayClient) => client.guilds.roles(guildId),
    other: (client: GatewayClient) => client.guilds.roles(otherGuildId),
    global: (client: GatewayClient) => client.roles,
    scopeId: guildId,
    id: roleId,
  },
  {
    name: "guild.voiceStates",
    seed: (client: GatewayClient) => client.voiceStates._add(voiceStateData as never),
    narrowed: (client: GatewayClient) => client.guilds.voiceStates(guildId),
    other: (client: GatewayClient) => client.guilds.voiceStates(otherGuildId),
    global: (client: GatewayClient) => client.voiceStates,
    scopeId: guildId,
    id: userId,
  },
  {
    name: "channel.messages",
    seed: (client: GatewayClient) => client.messages._add(messageData as never),
    narrowed: (client: GatewayClient) => new ChannelMessageManager(client, channelId),
    other: (client: GatewayClient) => new ChannelMessageManager(client, otherChannelId),
    global: (client: GatewayClient) => client.messages,
    scopeId: channelId,
    id: messageId,
  },
  {
    name: "thread.members",
    seed: (client: GatewayClient) => client.threadMembers._add(threadMemberData as never),
    narrowed: (client: GatewayClient) => new ThreadChannelMemberManager(client, threadId),
    other: (client: GatewayClient) => new ThreadChannelMemberManager(client, otherThreadId),
    global: (client: GatewayClient) => client.threadMembers,
    scopeId: threadId,
    id: userId,
  },
] as const;

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each(stores)("caches of one parent with %s", (_name, makeClient, isAsync) => {
  describe.each(scopes)("$name", ({ seed, narrowed, other, global, scopeId, id }) => {
    test("GIVEN an ID THEN cache.get reads the entry of the parent, like discord.js", async () => {
      const client = makeClient();
      await seed(client);
      const { cache } = narrowed(client);

      const cached = cache.get(id);

      expect(cache.synchronous).toBe(!isAsync);
      expect(cached instanceof Promise).toBe(isAsync);
      expect(await cached).toBeDefined();
      expect(await cache.has(id)).toBe(true);
      expect(await cache.get("1")).toBeUndefined();
    });

    test("GIVEN another parent THEN its cache does not hold the entry", async () => {
      const client = makeClient();
      await seed(client);
      const { cache } = other(client);

      expect(await cache.get(id)).toBeUndefined();
      expect(await cache.has(id)).toBe(false);
      expect(await cache.delete(id)).toBe(false);
      expect(await narrowed(client).cache.has(id)).toBe(true);
    });

    test("GIVEN cache.delete THEN the entry leaves the client's cache", async () => {
      const client = makeClient();
      await seed(client);
      const manager = global(client) as unknown as {
        cache: { get(key: string): unknown };
        resolveKey(scope: string, id: string): string;
      };

      expect(await narrowed(client).cache.delete(id)).toBe(true);
      expect(await manager.cache.get(manager.resolveKey(scopeId, id))).toBeUndefined();
    });
  });
});

describe("managers of a guild", () => {
  // A method of the manager of a guild, the arguments it is called with, and the manager of the client it forwards to.
  const forwards = [
    ["members", "fetchMe", []],
    ["members", "fetch", [userId]],
    ["members", "fetch", [userId, { force: true }]],
    ["members", "refresh", [userId]],
    ["members", "list", [{ limit: 10 }]],
    ["members", "search", [{ query: "wolf" }]],
    ["members", "request", [{ userIds: [userId] }]],
    ["members", "add", [userId, { accessToken: "token" }]],
    ["members", "edit", [userId, { nick: "Wolf" }]],
    ["members", "editMe", [{ nick: "Bot" }]],
    ["members", "kick", [userId, "reason"]],
    ["members", "ban", [userId, { reason: "reason" }]],
    ["members", "unban", [userId, "reason"]],
    ["members", "bulkBan", [[userId], { reason: "reason" }]],
    ["members", "prune", [{ days: 7 }]],
    ["members", "addRole", [userId, roleId, "reason"]],
    ["members", "removeRole", [userId, roleId, "reason"]],
    ["roles", "fetch", [roleId]],
    ["roles", "fetch", [roleId, { force: true }]],
    ["roles", "refresh", [roleId]],
    ["roles", "fetchAll", []],
    ["roles", "fetchMemberCounts", []],
    ["roles", "create", [{ name: "pack" }]],
    ["roles", "edit", [roleId, { name: "pack" }]],
    ["roles", "delete", [roleId, "reason"]],
    ["roles", "setPosition", [roleId, 2, { relative: true }]],
    ["roles", "setPositions", [[{ role: roleId, position: 2 }], "reason"]],
    ["roles", "everyone", []],
    ["roles", "highest", []],
    ["roles", "premiumSubscriberRole", []],
    ["roles", "botRoleFor", [userId]],
    ["voiceStates", "fetch", [userId]],
    ["voiceStates", "fetch", [userId, { force: true }]],
    ["voiceStates", "refresh", [userId]],
    ["voiceStates", "listCached", []],
  ] as const;

  test.each(forwards)(
    "GIVEN guild.%s.%s THEN it calls the client's manager with the guild's ID",
    async (name, method, args) => {
      const client = createClient();
      const result = Symbol("result");
      const spy = vi.spyOn(client[name] as never, method as never).mockReturnValue(result as never);
      const narrowed = client.guilds[name](guildId) as unknown as Record<
        string,
        (...args: unknown[]) => unknown
      >;

      expect(narrowed[method]!(...args)).toBe(result);
      expect(spy).toHaveBeenCalledWith(guildId, ...args);
    },
  );

  test.each(stores)(
    "GIVEN guild.members.me with %s THEN it is the bot's cached member, a getter like discord.js's",
    async (_name, makeClient, isAsync) => {
      const client = makeClient();
      const members = client.guilds.members(guildId);
      expect(await members.me).toBeNull();

      await client.members._add({ ...memberData, user: { ...user, id: client.id } } as never);

      const me: unknown = members.me;
      expect(me instanceof Promise).toBe(isAsync);
      expect((await members.me)?.id).toBe(client.id);
      expect(await client.guilds.members(otherGuildId).me).toBeNull();
    },
  );

  test("GIVEN a guild's managers THEN they are the client's classes, built for the guild", () => {
    const client = createClient();

    expect(client.guilds.members(guildId)).toBeInstanceOf(GuildMemberManager);
    expect(client.guilds.roles(guildId)).toBeInstanceOf(RoleManager);
    expect(client.guilds.voiceStates(guildId)).toBeInstanceOf(VoiceStateManager);
    expect(client.guilds.presences(guildId)).toBeInstanceOf(PresenceManager);
    expect(client.members.guildId).toBeUndefined();
    expect(client.members.cache).not.toBe(client.guilds.members(guildId).cache);
  });

  test.each(stores)(
    "GIVEN the cache of a guild with %s THEN it counts, sets and clears its entries alone",
    async (_name, makeClient) => {
      const client = makeClient();
      await client.roles._add(roleData as never);
      await client.roles._add({ ...roleData, id: "31" } as never);
      const kept = await client.roles._add({ ...roleData, guild_id: otherGuildId } as never);
      const { cache } = client.guilds.roles(guildId);

      expect(await cache.getSize()).toBe(2);
      expect(await client.guilds.roles(otherGuildId).cache.getSize()).toBe(1);

      await cache.set("32", await client.roles._build({ ...roleData, id: "32" } as never));
      expect(await client.roles.cache.has(client.roles.resolveKey(guildId, "32"))).toBe(true);
      expect(await cache.getSize()).toBe(3);

      await cache.clear();
      expect(await cache.getSize()).toBe(0);
      expect(await client.guilds.roles(otherGuildId).cache.get(kept.id)).toBeDefined();
    },
  );

  test("GIVEN two roles THEN comparePositions compares them", async () => {
    const client = createClient();
    const low = await client.roles._add(roleData as never);
    const high = await client.roles._add({ ...roleData, id: "31", position: 5 } as never);

    expect(client.guilds.roles(guildId).comparePositions(low, high)).toBeLessThan(0);
  });

  test("GIVEN a guild THEN members, roles and voiceStates are the managers of its ID", async () => {
    const client = createClient();
    await client.members._add(memberData as never);
    const guild = await client.guilds._add({ id: guildId, name: "Wolves" } as never);

    expect(guild.members.guildId).toBe(guildId);
    expect(guild.roles.guildId).toBe(guildId);
    expect(guild.voiceStates.guildId).toBe(guildId);
    expect((await guild.members.cache.get(userId))?.id).toBe(userId);
  });

  test("GIVEN the get of a channel or thread manager THEN it reads its cache", async () => {
    const client = createClient();
    await client.messages._add(messageData as never);
    await client.threadMembers._add(threadMemberData as never);

    expect((await new ChannelMessageManager(client, channelId).get(messageId))?.id).toBe(messageId);
    expect(await new ThreadChannelMemberManager(client, threadId).get(userId)).toBeDefined();
    expect(await new ThreadChannelMemberManager(client, otherThreadId).get(userId)).toBeUndefined();
  });
});
