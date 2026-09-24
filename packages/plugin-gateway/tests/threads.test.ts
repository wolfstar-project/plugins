import { WebSocketShardEvents } from "@discordjs/ws";
import { container } from "@wolfstar/http-framework";
import { createInMemoryCache, messageKey, threadMemberKey } from "@wolfstar/plugin-cache";
import {
  ChannelType,
  GatewayDispatchEvents,
  GatewayOpcodes,
  MessageType,
  Routes,
  type GatewayDispatchPayload,
} from "discord-api-types/v10";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  GatewayClient,
  ThreadMember,
  type ForumChannel,
  type GatewayEventMap,
  type GatewayEventName,
  type PublicThreadChannel,
  type TextChannel,
} from "../src/index.js";

const guildId = "100000000000000010";
const channelId = "200000000000000020";
const threadId = "200000000000000030";
const userId = "600000000000000600";

function createClient() {
  return new GatewayClient({
    discordPublicKey: "0".repeat(64),
    discordToken: "test-token",
    clientId: "266624760782258186",
    intents: 0,
    cache: createInMemoryCache(),
  });
}

function thread(extra: Record<string, unknown> = {}) {
  return {
    id: threadId,
    type: ChannelType.PublicThread,
    name: "hunt",
    guild_id: guildId,
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

async function cacheParent(client: GatewayClient, type = ChannelType.GuildText) {
  await client.cache!.channels.set(channelId, {
    id: channelId,
    type,
    name: "general",
    guild_id: guildId,
  } as never);
  return client.channels.get(channelId);
}

async function dispatch(client: GatewayClient, t: GatewayDispatchEvents, d: unknown) {
  const payload = { op: GatewayOpcodes.Dispatch, s: 1, t, d } as GatewayDispatchPayload;
  client.gateway.emit(WebSocketShardEvents.Dispatch, payload, 0);
  await client.idle();
}

function record<Event extends GatewayEventName>(client: GatewayClient, event: Event) {
  const calls: GatewayEventMap[Event][] = [];
  client.on(event, (...args: any[]) => {
    calls.push(args as GatewayEventMap[Event]);
  });
  return calls;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("thread creation", () => {
  test("GIVEN a text channel THEN it creates a private thread and caches it", async () => {
    const client = createClient();
    const channel = (await cacheParent(client)) as TextChannel;
    const post = vi
      .spyOn(container.rest, "post")
      .mockResolvedValue(thread({ type: ChannelType.PrivateThread }));

    const created = await channel.threads.create({
      name: "hunt",
      type: ChannelType.PrivateThread,
      invitable: false,
    });

    expect(post).toHaveBeenCalledWith(Routes.threads(channelId), {
      body: {
        name: "hunt",
        auto_archive_duration: undefined,
        rate_limit_per_user: undefined,
        type: ChannelType.PrivateThread,
        invitable: false,
      },
      files: undefined,
      reason: undefined,
    });
    expect(created.isThread()).toBe(true);
    expect(await client.cache!.threads.get(threadId)).toBeDefined();
  });

  test("GIVEN a forum channel THEN it creates a post with its first message", async () => {
    const client = createClient();
    const forum = (await cacheParent(client, ChannelType.GuildForum)) as ForumChannel;
    const post = vi.spyOn(container.rest, "post").mockResolvedValue(
      thread({
        message: {
          id: threadId,
          channel_id: threadId,
          author: {
            id: userId,
            username: "wolf",
            discriminator: "0",
            global_name: null,
            avatar: null,
          },
          content: "Awoo",
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
        },
      }),
    );

    await forum.threads.create({ name: "hunt", message: "Awoo", appliedTags: ["5"] });

    expect(post.mock.calls[0]![1]).toMatchObject({
      body: { name: "hunt", message: { content: "Awoo" }, applied_tags: ["5"] },
    });
    expect(await client.cache!.messages.get(messageKey(threadId, threadId))).toBeDefined();
  });
});

describe("thread defaults", () => {
  test("GIVEN no type THEN a public thread is created, an announcement one in announcement channels", async () => {
    const client = createClient();
    const post = vi.spyOn(container.rest, "post").mockResolvedValue(thread());

    const text = (await cacheParent(client)) as TextChannel;
    await text.threads.create({ name: "hunt" });
    await client.cache!.channels.set(channelId, {
      id: channelId,
      type: ChannelType.GuildAnnouncement,
      name: "news",
      guild_id: guildId,
    } as never);
    await text.threads.create({ name: "hunt" });

    const types = post.mock.calls.map(
      ([, options]) => (options as { body: { type: number } }).body.type,
    );
    expect(types).toEqual([ChannelType.PublicThread, ChannelType.AnnouncementThread]);
  });

  test("GIVEN members.fetch with withMember THEN it asks the API for the guild member", async () => {
    const client = createClient();
    await client.cache!.threads.set(threadId, thread() as never);
    const get = vi.spyOn(container.rest, "get").mockResolvedValue(threadMember());
    const cached = (await client.threads.get(threadId)) as PublicThreadChannel;

    await cached.members.fetch(userId, { withMember: true });

    const [route, options] = get.mock.calls[0]!;
    expect(route).toBe(Routes.threadMembers(threadId, userId));
    expect((options as { query: URLSearchParams }).query.toString()).toBe("with_member=true");
  });
});

describe("thread actions", () => {
  test("GIVEN setArchived THEN the thread stays in the thread cache, archived", async () => {
    const client = createClient();
    await client.cache!.threads.set(threadId, thread() as never);
    const patch = vi
      .spyOn(container.rest, "patch")
      .mockResolvedValue(
        thread({ thread_metadata: { ...thread().thread_metadata, archived: true } }),
      );
    const cached = (await client.threads.get(threadId)) as PublicThreadChannel;

    await cached.setArchived(true, "done");

    expect(patch).toHaveBeenCalledWith(Routes.channel(threadId), {
      body: { archived: true },
      reason: "done",
    });
    expect(cached.archived).toBe(true);
    expect(((await client.threads.get(threadId)) as PublicThreadChannel).archived).toBe(true);
    expect(await client.cache!.channels.get(threadId)).toBeUndefined();
  });

  test("GIVEN join and leave THEN the bot's membership changes", async () => {
    const client = createClient();
    await client.cache!.threads.set(threadId, thread() as never);
    const put = vi.spyOn(container.rest, "put").mockResolvedValue(undefined);
    const remove = vi.spyOn(container.rest, "delete").mockResolvedValue(undefined);
    const cached = (await client.threads.get(threadId)) as PublicThreadChannel;

    await cached.join();
    await cached.leave();

    expect(put).toHaveBeenCalledWith(Routes.threadMembers(threadId, "@me"));
    expect(remove).toHaveBeenCalledWith(Routes.threadMembers(threadId, "@me"));
  });

  test("GIVEN members.list THEN the members are cached with their guild ID", async () => {
    const client = createClient();
    await client.cache!.threads.set(threadId, thread() as never);
    vi.spyOn(container.rest, "get").mockResolvedValue([threadMember()]);
    const cached = (await client.threads.get(threadId)) as PublicThreadChannel;

    const [member] = await cached.members.list();

    expect(member).toBeInstanceOf(ThreadMember);
    expect(member!.id).toBe(userId);
    expect(await client.cache!.threadMembers.get(threadMemberKey(threadId, userId))).toMatchObject({
      guild_id: guildId,
    });
  });

  test("GIVEN fetchStarterMessage THEN it fetches the parent's message with the thread's ID", async () => {
    const client = createClient();
    await client.cache!.threads.set(threadId, thread() as never);
    const get = vi.spyOn(container.rest, "get").mockResolvedValue({
      id: threadId,
      channel_id: channelId,
      author: { id: userId, username: "wolf", discriminator: "0", global_name: null, avatar: null },
      content: "start",
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
    });
    const cached = (await client.threads.get(threadId)) as PublicThreadChannel;

    const starter = await cached.fetchStarterMessage();

    expect(get).toHaveBeenCalledWith(Routes.channelMessage(channelId, threadId));
    expect(starter.content).toBe("start");
  });

  test("GIVEN fetchActive on a channel THEN only its threads are kept", async () => {
    const client = createClient();
    const channel = (await cacheParent(client)) as TextChannel;
    vi.spyOn(container.rest, "get").mockResolvedValue({
      threads: [thread(), thread({ id: "9", parent_id: "8" })],
      members: [threadMember()],
    });

    const { threads, members } = await channel.threads.fetchActive();

    expect(threads.map((value) => value.id)).toEqual([threadId]);
    expect(members.map((member) => member.threadId)).toEqual([threadId]);
  });

  test("GIVEN fetchArchived THEN it pages by archive time", async () => {
    const client = createClient();
    const channel = (await cacheParent(client)) as TextChannel;
    const get = vi
      .spyOn(container.rest, "get")
      .mockResolvedValue({ threads: [thread()], members: [], has_more: true });

    const result = await channel.threads.fetchArchived({ type: "private", before: 0, limit: 2 });

    const [route, options] = get.mock.calls[0]!;
    expect(route).toBe(Routes.channelThreads(channelId, "private"));
    expect((options as { query: URLSearchParams }).query.toString()).toBe(
      "limit=2&before=1970-01-01T00%3A00%3A00.000Z",
    );
    expect(result.hasMore).toBe(true);
  });
});

describe("thread events", () => {
  test("GIVEN THREAD_MEMBERS_UPDATE THEN added and removed members are emitted", async () => {
    const client = createClient();
    await client.cache!.threads.set(threadId, thread() as never);
    await client.cache!.threadMembers.set(
      threadMemberKey(threadId, "7"),
      threadMember({ user_id: "7" }) as never,
    );
    const calls = record(client, "threadMembersUpdate");

    await dispatch(client, GatewayDispatchEvents.ThreadMembersUpdate, {
      id: threadId,
      guild_id: guildId,
      member_count: 1,
      added_members: [threadMember()],
      removed_member_ids: ["7"],
    });

    const [[added, removed, emittedThread]] = calls;
    expect(added.map((member) => member.id)).toEqual([userId]);
    expect(removed.map((member) => member.id)).toEqual(["7"]);
    expect(emittedThread?.id).toBe(threadId);
    expect(await client.cache!.threadMembers.get(threadMemberKey(threadId, "7"))).toBeUndefined();
  });

  test("GIVEN THREAD_LIST_SYNC THEN the threads and memberships are emitted", async () => {
    const client = createClient();
    const calls = record(client, "threadListSync");

    await dispatch(client, GatewayDispatchEvents.ThreadListSync, {
      guild_id: guildId,
      channel_ids: [channelId],
      threads: [thread()],
      members: [threadMember()],
    });

    const [[threads, members]] = calls;
    expect(threads.map((value) => value.id)).toEqual([threadId]);
    expect(members[0]).toBeInstanceOf(ThreadMember);
  });

  test("GIVEN THREAD_MEMBER_UPDATE THEN the previous member is emitted too", async () => {
    const client = createClient();
    await client.cache!.threadMembers.set(
      threadMemberKey(threadId, userId),
      threadMember() as never,
    );
    const calls = record(client, "threadMemberUpdate");

    await dispatch(
      client,
      GatewayDispatchEvents.ThreadMemberUpdate,
      threadMember({ flags: 2, guild_id: guildId }),
    );

    const [[previous, current]] = calls;
    expect(previous?.flags).toBe(0);
    expect(current.flags).toBe(2);
  });
});
