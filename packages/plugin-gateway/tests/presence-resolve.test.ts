import { createRedisCache } from "@wolfstar/plugin-cache";
import {
  MessageType,
  PresenceUpdateStatus,
  type APIGuildMember,
  type APIMessage,
  type APIThreadMember,
  type APIUser,
  type GatewayPresenceUpdate,
} from "discord-api-types/v10";
import { describe, expect, test } from "vitest";
import {
  GatewayClient,
  GuildMember,
  Message,
  Presence,
  ThreadMember,
  User,
  type GatewayClientOptions,
} from "../src/index.js";
import { FakeRedis } from "../../../tests/fixtures/FakeRedis.js";

const guildId = "100000000000000010";
const otherGuildId = "100000000000000011";
const channelId = "200000000000000020";
const threadId = "700000000000000070";
const userId = "600000000000000600";
const otherUserId = "600000000000000601";

const apiUser: APIUser = {
  id: userId,
  username: "wolf",
  discriminator: "0",
  global_name: "Wolf",
  avatar: null,
};

const presenceData: GatewayPresenceUpdate = {
  user: { id: userId },
  guild_id: guildId,
  status: PresenceUpdateStatus.Online,
  activities: [],
  client_status: { desktop: PresenceUpdateStatus.Online },
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

function guildMember(guild = guildId) {
  const data: APIGuildMember & { guild_id: string } = {
    user: apiUser,
    roles: [],
    joined_at: "2026-01-01T00:00:00.000Z",
    deaf: false,
    mute: false,
    guild_id: guild,
  };
  return new GuildMember(data);
}

function message(extra: Partial<APIMessage> & { guild_id?: string } = {}) {
  return new Message({
    id: "1200000000000000000",
    channel_id: channelId,
    author: apiUser,
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
    guild_id: guildId,
    ...extra,
  } as APIMessage);
}

function threadMember(relations: ConstructorParameters<typeof ThreadMember>[1] = {}) {
  const data: APIThreadMember = {
    id: threadId,
    user_id: userId,
    join_timestamp: "2026-01-01T00:00:00.000Z",
    flags: 0,
  };
  return new ThreadMember(data, relations);
}

const stores = [
  ["a synchronous cache", () => createClient(), false],
  [
    "an asynchronous cache",
    () => createClient({ cache: createRedisCache({ redis: new FakeRedis() }) }),
    true,
  ],
] as const;

describe.each(stores)("PresenceManager#resolve with %s", (_name, makeClient, isAsync) => {
  async function seeded() {
    const client = makeClient();
    const cached = await client.presences._add(presenceData as never);
    return { client, cached };
  }

  test("GIVEN a presence THEN it is returned as is, cached or not", async () => {
    const { client } = await seeded();
    const detached = new Presence({ ...presenceData, guild_id: otherGuildId } as never);

    expect(client.presences.resolve(detached)).toBe(detached);
  });

  test("GIVEN a guild member THEN its guild and user find the cached presence", async () => {
    const { client } = await seeded();

    const resolved = client.presences.resolve(guildMember());

    expect(resolved instanceof Promise).toBe(isAsync);
    expect(await resolved).toBeInstanceOf(Presence);
    expect((await resolved)?.userId).toBe(userId);
    expect(await client.presences.resolve(guildMember(otherGuildId))).toBeNull();
  });

  test("GIVEN a user or a user ID THEN the guildId argument tells the guild", async () => {
    const { client } = await seeded();
    const user = new User(apiUser);

    for (const value of [user, userId]) {
      expect((await client.presences.resolve(value, guildId))?.userId).toBe(userId);
      expect(await client.presences.resolve(value, otherGuildId)).toBeNull();
      expect(await client.presences.resolve(value)).toBeNull();
    }
  });

  test("GIVEN a miss THEN it resolves to null without calling the API", async () => {
    const { client } = await seeded();

    expect(await client.presences.resolve(otherUserId, guildId)).toBeNull();
  });

  test("GIVEN a message THEN its guild and author find the presence, and a DM message is null", async () => {
    const { client } = await seeded();

    expect((await client.presences.resolve(message()))?.userId).toBe(userId);
    const dm = message({ guild_id: undefined });
    expect(await client.presences.resolve(dm)).toBeNull();
    expect((await client.presences.resolve(dm, guildId))?.userId).toBe(userId);
  });

  test("GIVEN a thread member THEN the guild comes from its member, else from the guildId argument", async () => {
    const { client } = await seeded();

    const withMember = threadMember({ guildMember: guildMember() });
    expect((await client.presences.resolve(withMember))?.userId).toBe(userId);
    expect(await client.presences.resolve(threadMember())).toBeNull();
    expect((await client.presences.resolve(threadMember(), guildId))?.userId).toBe(userId);
  });

  test("GIVEN a guildId argument and a member THEN the member's own guild wins", async () => {
    const { client } = await seeded();

    expect((await client.presences.resolve(guildMember(), otherGuildId))?.userId).toBe(userId);
  });
});

describe("PresenceManager#resolve without a cache entry", () => {
  test("GIVEN presences are not cached THEN resolve answers null", async () => {
    const client = createClient({ cacheOptions: { presences: { maxSize: 0 } } });
    await client.presences._add(presenceData as never);

    expect(await client.presences.resolve(userId, guildId)).toBeNull();
    expect(await client.presences.resolve(guildMember())).toBeNull();
  });

  test("GIVEN a cache key THEN it is a user ID that misses, the key being resolveKey's", async () => {
    const client = createClient();
    await client.presences._add(presenceData as never);

    expect(
      await client.presences.resolve(client.presences.resolveKey(guildId, userId), guildId),
    ).toBe(null);
    expect(
      (await client.presences.cache.get(client.presences.resolveKey(guildId, userId)))?.userId,
    ).toBe(userId);
  });
});

describe("PresenceManager#resolveId", () => {
  test("GIVEN every resolvable THEN it is the ID of the user, not the cache key", async () => {
    const client = createClient();
    const presence = await client.presences._add(presenceData as never);

    expect(client.presences.resolveId(presence)).toBe(userId);
    expect(client.presences.resolveId(new User(apiUser))).toBe(userId);
    expect(client.presences.resolveId(guildMember())).toBe(userId);
    expect(client.presences.resolveId(threadMember())).toBe(userId);
    expect(client.presences.resolveId(message())).toBe(userId);
    expect(client.presences.resolveId(userId)).toBe(userId);
  });

  test("GIVEN a thread member without a user THEN it is null", () => {
    const client = createClient();
    const data = {
      id: threadId,
      join_timestamp: "2026-01-01T00:00:00.000Z",
      flags: 0,
    } as APIThreadMember;

    expect(client.presences.resolveId(new ThreadMember(data))).toBeNull();
  });
});
