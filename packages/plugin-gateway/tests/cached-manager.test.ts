import { container } from "@wolfstar/http-framework";
import { createInMemoryCache, memberKey, messageKey } from "@wolfstar/plugin-cache";
import { MessageType, type APIMessage, type APIUser } from "discord-api-types/v10";
import { afterEach, describe, expect, test, vi } from "vitest";
import { GatewayClient, User } from "../src/index.js";

const guildId = "100000000000000010";
const channelId = "200000000000000020";
const user: APIUser = {
  id: "600000000000000600",
  username: "wolf",
  discriminator: "0",
  global_name: "Wolf",
  avatar: null,
};

function createClient() {
  return new GatewayClient({
    discordPublicKey: "0".repeat(64),
    discordToken: "test-token",
    clientId: "266624760782258186",
    intents: 0,
    cache: createInMemoryCache(),
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CachedManager#_add", () => {
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
    });

    await expect(client.users._add(user)).resolves.toBeInstanceOf(User);
  });
});

describe("CachedManager#resolve", () => {
  test("GIVEN a structure, a cached key, or an unknown key THEN it resolves accordingly", async () => {
    const client = createClient();
    const structure = new User(user);
    await client.cache!.users.set(user.id, user);

    await expect(client.users.resolve(structure)).resolves.toBe(structure);
    expect((await client.users.resolve(user.id))?.username).toBe("wolf");
    await expect(client.users.resolve("1")).resolves.toBeNull();
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

  test("GIVEN a cached message THEN get resolves its author from the users cache", async () => {
    const client = createClient();
    await client.cache!.messages.set(messageKey(channelId, "1200000000000000000"), message());
    await client.cache!.users.set(user.id, { ...user, username: "renamed" });

    const cached = await client.messages.get(channelId, "1200000000000000000");

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
