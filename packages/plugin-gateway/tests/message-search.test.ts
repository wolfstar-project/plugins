import { Collection } from "@discordjs/collection";
import { createInMemoryCache, messageKey, threadMemberKey } from "@wolfstar/plugin-cache";
import {
  ChannelType,
  MessageSearchAuthorType,
  MessageSearchEmbedType,
  MessageSearchHasType,
  MessageSearchSortMode,
  MessageType,
  RESTJSONErrorCodes,
  type APIUser,
} from "discord-api-types/v10";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  GatewayClient,
  GatewayError,
  GatewayRangeError,
  GatewayTypeError,
  Message,
  ThreadMember,
  type GuildSearchMessagesOptions,
} from "../src/index.js";

const guildId = "100000000000000010";
const channelId = "200000000000000020";
const threadId = "200000000000000030";
const userId = "600000000000000600";
const route = `/guilds/${guildId}/messages/search`;
const author: APIUser = {
  id: userId,
  username: "wolf",
  discriminator: "0",
  global_name: null,
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

function message(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    channel_id: channelId,
    author,
    content: "awoo",
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

function thread(extra: Record<string, unknown> = {}) {
  return {
    id: threadId,
    type: ChannelType.PublicThread,
    name: "hunt",
    parent_id: channelId,
    owner_id: userId,
    thread_metadata: {
      archived: false,
      locked: false,
      auto_archive_duration: 1440,
      archive_timestamp: "2026-01-01T00:00:00.000Z",
    },
    ...extra,
  };
}

function threadMember(extra: Record<string, unknown> = {}) {
  return {
    id: threadId,
    user_id: userId,
    join_timestamp: "2026-01-01T00:00:00.000Z",
    flags: 0,
    ...extra,
  };
}

function result(extra: Record<string, unknown> = {}) {
  return {
    doing_deep_historical_index: false,
    total_results: 2,
    messages: [[message("1200000000000000001")], [message("1200000000000000002")]],
    ...extra,
  };
}

function notReady(extra: Record<string, unknown> = {}) {
  return {
    message: "Index not yet available. Try again later",
    code: RESTJSONErrorCodes.IndexNotYetAvailable,
    documents_indexed: 3,
    retry_after: 2,
    ...extra,
  };
}

function spyGet(...responses: unknown[]) {
  const get = vi.spyOn(client.api.rest, "get");
  for (const response of responses) get.mockResolvedValueOnce(response as never);
  return get;
}

function queryOf(get: ReturnType<typeof spyGet>, call = 0) {
  const options = get.mock.calls[call]![1] as { query: URLSearchParams };
  return options.query;
}

let client: GatewayClient;

beforeEach(() => {
  client = createClient();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("query serialization", () => {
  test("GIVEN no options THEN it requests the route with an empty query", async () => {
    const get = spyGet(result());
    await client.guilds.searchMessages(guildId);

    expect(get.mock.calls[0]![0]).toBe(route);
    expect(queryOf(get).toString()).toBe("");
  });

  test("GIVEN every option THEN it serializes arrays as repeated keys under the API's names", async () => {
    const get = spyGet(result());
    await client.guilds.searchMessages(guildId, {
      content: "wolf pack",
      slop: 4,
      minId: "1",
      maxId: "9",
      channelIds: ["10", "11"],
      authorType: [MessageSearchAuthorType.User, MessageSearchAuthorType.NotBot],
      authorIds: ["20"],
      mentions: ["21", "22"],
      mentionsRoleIds: ["30"],
      mentionEveryone: false,
      repliedToUserIds: ["23"],
      repliedToMessageIds: ["40"],
      pinned: true,
      has: [MessageSearchHasType.Image],
      embedType: [MessageSearchEmbedType.Gif],
      embedProvider: ["Tenor"],
      linkHostname: ["discordapp.com"],
      attachmentFilename: ["a.txt"],
      attachmentExtension: ["txt"],
      sortBy: MessageSearchSortMode.Relevance,
      sortOrder: "asc",
      includeNsfw: true,
      limit: 10,
      offset: 20,
    });

    const query = queryOf(get);
    expect(query.getAll("channel_id")).toEqual(["10", "11"]);
    expect(query.getAll("author_type")).toEqual(["user", "-bot"]);
    expect(query.getAll("mentions")).toEqual(["21", "22"]);
    expect(query.get("mentions_role_id")).toBe("30");
    expect(query.get("replied_to_user_id")).toBe("23");
    expect(query.get("replied_to_message_id")).toBe("40");
    expect(query.get("author_id")).toBe("20");
    expect(query.get("mention_everyone")).toBe("false");
    expect(query.get("pinned")).toBe("true");
    expect(query.get("has")).toBe("image");
    expect(query.get("embed_type")).toBe("gif");
    expect(query.get("embed_provider")).toBe("Tenor");
    expect(query.get("link_hostname")).toBe("discordapp.com");
    expect(query.get("attachment_filename")).toBe("a.txt");
    expect(query.get("attachment_extension")).toBe("txt");
    expect(query.get("sort_by")).toBe("relevance");
    expect(query.get("sort_order")).toBe("asc");
    expect(query.get("include_nsfw")).toBe("true");
    expect(query.get("content")).toBe("wolf pack");
    expect(query.get("slop")).toBe("4");
    expect(query.get("min_id")).toBe("1");
    expect(query.get("max_id")).toBe("9");
    expect(query.get("limit")).toBe("10");
    expect(query.get("offset")).toBe("20");
    expect(query.toString()).toContain("channel_id=10&channel_id=11");
  });

  test("GIVEN structures THEN it resolves their IDs", async () => {
    const user = await client.users._add(author);
    const sent = await client.messages._add(message("1200000000000000005") as never);
    const get = spyGet(result());

    await client.guilds.searchMessages(guildId, {
      authorIds: [user, sent],
      mentions: [sent],
      repliedToMessageIds: [sent],
      minId: sent,
    });

    const query = queryOf(get);
    expect(query.getAll("author_id")).toEqual([userId, userId]);
    expect(query.getAll("mentions")).toEqual([userId]);
    expect(query.getAll("replied_to_message_id")).toEqual([sent.id]);
    expect(query.get("min_id")).toBe(sent.id);
  });

  test("GIVEN a resolvable without an ID THEN it throws before requesting", async () => {
    const get = spyGet();
    await expect(
      client.guilds.searchMessages(guildId, { channelIds: [{ id: null } as never] }),
    ).rejects.toBeInstanceOf(GatewayTypeError);
    expect(get).not.toHaveBeenCalled();
  });

  test.each<[string, GuildSearchMessagesOptions, string]>([
    ["content", { content: "a".repeat(1025) }, "MessageSearchContentLength"],
    ["slop", { slop: 101 }, "MessageSearchSlop"],
    [
      "channelIds",
      { channelIds: Array.from({ length: 501 }, (_, i) => String(i)) },
      "MessageSearchChannelIdsLimit",
    ],
    ["limit zero", { limit: 0 }, "MessageSearchLimit"],
    ["limit", { limit: 26 }, "MessageSearchLimit"],
    ["offset", { offset: 9976 }, "MessageSearchOffset"],
  ])("GIVEN a %s over the cap THEN it throws before requesting", async (_name, options, code) => {
    const get = spyGet();
    const error = await client.guilds
      .searchMessages(guildId, options)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(GatewayRangeError);
    expect((error as GatewayRangeError).code).toBe(code);
    expect(get).not.toHaveBeenCalled();
  });

  test("GIVEN values at the caps THEN it requests", async () => {
    const get = spyGet(result());
    await client.guilds.searchMessages(guildId, {
      content: "a".repeat(1024),
      slop: 100,
      limit: 25,
      offset: 9975,
      channelIds: Array.from({ length: 500 }, (_, i) => String(i)),
    });
    expect(get).toHaveBeenCalledTimes(1);
  });
});

describe("the index not being ready", () => {
  test("GIVEN retry_after THEN it waits that many seconds and retries", async () => {
    vi.useFakeTimers();
    const get = spyGet(notReady(), result());
    const search = client.guilds.searchMessages(guildId);

    await vi.advanceTimersByTimeAsync(1999);
    expect(get).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect((await search).messages.size).toBe(2);
    expect(get).toHaveBeenCalledTimes(2);
  });

  test.each([undefined, 0])(
    "GIVEN a retry_after of %s THEN it waits one second",
    async (retryAfter) => {
      vi.useFakeTimers();
      const get = spyGet(notReady({ retry_after: retryAfter }), result());
      const search = client.guilds.searchMessages(guildId);

      await vi.advanceTimersByTimeAsync(999);
      expect(get).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await search;
      expect(get).toHaveBeenCalledTimes(2);
    },
  );

  test("GIVEN retryOnMissingIndex false THEN it throws SearchIndexNotYetAvailable with the answer", async () => {
    const get = spyGet(notReady());
    const error = await client.guilds
      .searchMessages(guildId, { retryOnMissingIndex: false })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(GatewayError);
    expect(error).toMatchObject({
      code: "SearchIndexNotYetAvailable",
      retryAfter: 2,
      documentsIndexed: 3,
    });
    expect(get).toHaveBeenCalledTimes(1);
  });

  test("GIVEN a signal aborted mid-wait THEN it rejects without retrying", async () => {
    vi.useFakeTimers();
    const get = spyGet(notReady(), result());
    const controller = new AbortController();
    const search = client.guilds.searchMessages(guildId, { signal: controller.signal });
    const rejection = expect(search).rejects.toMatchObject({ name: "AbortError" });

    await vi.advanceTimersByTimeAsync(500);
    controller.abort();
    await rejection;
    await vi.advanceTimersByTimeAsync(5000);
    expect(get).toHaveBeenCalledTimes(1);
  });

  test("GIVEN a signal THEN it is passed to the request", async () => {
    const get = spyGet(result());
    const controller = new AbortController();
    await client.guilds.searchMessages(guildId, { signal: controller.signal });
    expect((get.mock.calls[0]![1] as { signal: AbortSignal }).signal).toBe(controller.signal);
  });
});

describe("the result", () => {
  test("GIVEN nested messages THEN it flattens them into a Collection, in order, with the guild set", async () => {
    spyGet(result({ total_results: 41, doing_deep_historical_index: true }));
    const found = await client.guilds.searchMessages(guildId);

    expect(found.messages).toBeInstanceOf(Collection);
    expect([...found.messages.keys()]).toEqual(["1200000000000000001", "1200000000000000002"]);
    const first = found.messages.first()!;
    expect(first).toBeInstanceOf(Message);
    expect(first.guildId).toBe(guildId);
    expect(first.content).toBe("awoo");
    expect(found.totalResults).toBe(41);
    expect(found.doingDeepHistoricalIndex).toBe(true);
    expect(await client.cache!.messages.get(messageKey(channelId, first.id))).toBeDefined();
  });

  test("GIVEN documents_indexed THEN it is present, and absent otherwise", async () => {
    spyGet(result({ documents_indexed: 7 }), result());

    expect((await client.guilds.searchMessages(guildId)).documentsIndexed).toBe(7);
    expect("documentsIndexed" in (await client.guilds.searchMessages(guildId))).toBe(false);
  });

  test("GIVEN threads and thread members THEN it caches the threads and groups the members by thread then user", async () => {
    const otherThread = "200000000000000031";
    const otherUser = "600000000000000601";
    spyGet(
      result({
        threads: [thread(), thread({ id: otherThread })],
        members: [
          threadMember(),
          threadMember({ user_id: otherUser }),
          threadMember({ id: otherThread }),
        ],
      }),
    );
    const found = await client.guilds.searchMessages(guildId);

    expect([...found.threads.keys()]).toEqual([threadId, otherThread]);
    expect(await client.cache!.threads.get(threadId)).toBeDefined();
    expect([...found.threadMembers.keys()]).toEqual([threadId, otherThread]);
    expect([...found.threadMembers.get(threadId)!.keys()]).toEqual([userId, otherUser]);
    expect([...found.threadMembers.get(otherThread)!.keys()]).toEqual([userId]);
    expect(found.threadMembers.get(threadId)!.get(userId)).toBeInstanceOf(ThreadMember);
    expect(
      await client.cache!.threadMembers.get(threadMemberKey(otherThread, userId)),
    ).toBeDefined();
  });

  test("GIVEN a thread without guild_id THEN it falls back to the searched guild", async () => {
    spyGet(result({ threads: [thread()] }));
    const found = await client.guilds.searchMessages(guildId);
    expect(found.threads.get(threadId)!.guildId).toBe(guildId);
  });

  test("GIVEN no threads or members THEN the collections are empty", async () => {
    spyGet(result());
    const found = await client.guilds.searchMessages(guildId);
    expect(found.threads.size).toBe(0);
    expect(found.threadMembers.size).toBe(0);
  });

  test("GIVEN cache false THEN it builds the structures and writes nothing", async () => {
    spyGet(result({ threads: [thread()], members: [threadMember()] }));
    const found = await client.guilds.searchMessages(guildId, { cache: false });

    expect(found.messages.size).toBe(2);
    expect(found.threads.size).toBe(1);
    expect(found.threadMembers.get(threadId)!.size).toBe(1);
    expect(
      await client.cache!.messages.get(messageKey(channelId, "1200000000000000001")),
    ).toBeUndefined();
    expect(await client.cache!.threads.get(threadId)).toBeUndefined();
    expect(
      await client.cache!.threadMembers.get(threadMemberKey(threadId, userId)),
    ).toBeUndefined();
    expect(await client.cache!.users.get(userId)).toBeUndefined();
  });
});

describe("Guild#searchMessages", () => {
  test("GIVEN a cached guild THEN it delegates to the manager with its ID", async () => {
    await client.cache!.guilds.set(guildId, { id: guildId, name: "Pack", features: [] } as never);
    const guild = (await client.guilds.cache.get(guildId))!;
    const get = spyGet(result());

    const found = await guild.searchMessages({ content: "awoo" });

    expect(get.mock.calls[0]![0]).toBe(route);
    expect(queryOf(get).get("content")).toBe("awoo");
    expect(found.messages.size).toBe(2);
  });
});
