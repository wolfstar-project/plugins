import { Collection } from "@discordjs/collection";
import { container } from "@wolfstar/http-framework";
import { createInMemoryCache, messageKey } from "@wolfstar/plugin-cache";
import {
  ChannelType,
  MessageFlags,
  MessageReferenceType,
  MessageType,
  Routes,
  type APIMessage,
  type APIUser,
} from "discord-api-types/v10";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  Attachment,
  createChannel,
  Embed,
  GatewayClient,
  Message,
  MessageMentions,
  MessageReaction,
  ReactionEmoji,
  Sticker,
  type GatewayClientOptions,
  type TextChannel,
} from "../src/index.js";

const channelId = "200000000000000020";
const guildId = "100000000000000010";
const author: APIUser = {
  id: "600000000000000600",
  username: "wolf",
  discriminator: "0",
  global_name: "Wolf",
  avatar: null,
};
const mentioned: APIUser = {
  id: "700000000000000700",
  username: "howl",
  discriminator: "0",
  global_name: null,
  avatar: null,
};

function createClient(options: Partial<GatewayClientOptions> = {}) {
  return new GatewayClient({
    discordPublicKey: "0".repeat(64),
    discordToken: "test-token",
    clientId: author.id,
    intents: 0,
    cache: createInMemoryCache(),
    ...options,
  });
}

function message(extra: Partial<APIMessage> = {}): APIMessage {
  return {
    id: "1200000000000000000",
    channel_id: channelId,
    author,
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

describe("Message", () => {
  test("GIVEN a payload THEN the nested structures are built", () => {
    createClient();
    const msg = new Message({
      ...message({
        guild_id: guildId,
        flags: MessageFlags.SuppressEmbeds,
        attachments: [
          {
            id: "1",
            filename: "wolf.png",
            size: 10,
            url: "https://cdn.discordapp.com/wolf.png",
            proxy_url: "https://media.discordapp.net/wolf.png",
          },
        ],
        embeds: [{ title: "Pack", color: 0xff_00_00 }],
        reactions: [
          {
            count: 2,
            count_details: { normal: 2, burst: 0 },
            me: true,
            me_burst: false,
            burst_colors: [],
            emoji: { id: null, name: "🐺" },
          },
        ],
        poll: {
          question: { text: "Best pack?" },
          answers: [{ answer_id: 1, poll_media: { text: "Ours" } }],
          expiry: "2026-01-02T00:00:00.000Z",
          allow_multiselect: false,
          layout_type: 1,
          results: { is_finalized: false, answer_counts: [{ id: 1, count: 3, me_voted: true }] },
        },
      }),
    } as never);

    expect(msg.flags.has(MessageFlags.SuppressEmbeds)).toBe(true);
    expect(msg.attachments.first()).toBeInstanceOf(Attachment);
    expect(msg.embeds[0]).toBeInstanceOf(Embed);
    expect(msg.embeds[0]!.hexColor).toBe("#ff0000");
    expect(msg.reactions.cache.size).toBe(1);
    expect(msg.reactions.resolve("🐺")?.count).toBe(2);
    expect(msg.poll?.answers[0]?.voteCount).toBe(3);
    expect(msg.system).toBe(false);
    expect(msg.url).toBe(`https://discord.com/channels/${guildId}/${channelId}/${msg.id}`);
  });

  test("GIVEN attachments, stickers and snapshots THEN they are Collections keyed by ID", () => {
    createClient();
    const msg = new Message(
      message({
        attachments: [
          {
            id: "1",
            filename: "wolf.png",
            size: 10,
            url: "https://cdn.discordapp.com/wolf.png",
            proxy_url: "https://media.discordapp.net/wolf.png",
          },
        ],
        sticker_items: [{ id: "5", name: "howl", format_type: 1 }],
        message_reference: {
          type: MessageReferenceType.Forward,
          channel_id: "200000000000000201",
          message_id: "700000000000000702",
        },
        message_snapshots: [{ message: { content: "awoo" } as never }],
      }) as never,
    );

    expect(msg.attachments).toBeInstanceOf(Collection);
    expect(msg.attachments.get("1")).toBeInstanceOf(Attachment);
    expect(msg.stickers).toBeInstanceOf(Collection);
    expect(msg.stickers.get("5")).toBeInstanceOf(Sticker);
    expect(msg.stickers.get("5")?.name).toBe("howl");
    expect(msg.stickers.get("5")?.format).toBe(1);
    expect(() => JSON.stringify(msg.stickers.get("5"))).not.toThrow();
    expect(msg.messageSnapshots).toBeInstanceOf(Collection);
    expect(msg.messageSnapshots.get("700000000000000702")?.content).toBe("awoo");
  });

  test("GIVEN no attachments or stickers THEN the Collections are empty", () => {
    const msg = new Message({ id: "3", channel_id: channelId } as never);

    expect(msg.attachments.size).toBe(0);
    expect(msg.stickers.size).toBe(0);
    expect(msg.messageSnapshots.size).toBe(0);
  });

  test("GIVEN a unicode and a custom reaction with the same name THEN reactions.cache keys them apart", () => {
    const counts = {
      count: 1,
      count_details: { normal: 1, burst: 0 },
      me: false,
      me_burst: false,
      burst_colors: [],
    };
    const msg = new Message(
      message({
        reactions: [
          { ...counts, emoji: { id: null, name: "wolf" } },
          { ...counts, emoji: { id: "123456789012345678", name: "wolf" } },
        ],
      }),
    );

    expect(msg.reactions.cache).toBeInstanceOf(Collection);
    expect([...msg.reactions.cache.keys()]).toEqual(["wolf", "123456789012345678"]);
  });

  test("GIVEN mentions THEN MessageMentions resolves users, members, and channels", () => {
    const msg = new Message(
      message({
        guild_id: guildId,
        content: `<@${mentioned.id}> see <#${channelId}> @everyone`,
        mentions: [{ ...mentioned, member: { roles: [], joined_at: "2026-01-01" } }] as never,
        mention_roles: ["900000000000000900"],
      }),
    );

    const { mentions } = msg;
    expect(mentions).toBeInstanceOf(MessageMentions);
    expect(mentions.users.map((user) => user.id)).toEqual([mentioned.id]);
    expect(mentions.members.map((member) => member.id)).toEqual([mentioned.id]);
    expect(mentions.channelIds).toEqual([channelId]);
    expect(mentions.has(mentioned.id, { ignoreEveryone: true })).toBe(true);
    expect(
      mentions.has({ id: "1", roleIds: ["900000000000000900"] }, { ignoreEveryone: true }),
    ).toBe(true);
    expect(msg.cleanContent).toBe(
      `@howl see <#${channelId}> @${String.fromCodePoint(0x20_0b)}everyone`,
    );
  });

  test("GIVEN reply THEN it sends a message reference defaulting to failIfNotExists true", async () => {
    createClient();
    const post = vi.spyOn(container.rest, "post").mockResolvedValue(message({ id: "2" }));

    await new Message(message()).reply("hi");

    expect(post).toHaveBeenCalledWith(Routes.channelMessages(channelId), {
      body: {
        content: "hi",
        message_reference: {
          type: MessageReferenceType.Default,
          message_id: "1200000000000000000",
          channel_id: channelId,
          fail_if_not_exists: true,
        },
      },
      files: undefined,
    });
  });

  test("GIVEN reply on a client with failIfNotExists false THEN it uses that default", async () => {
    createClient({ failIfNotExists: false });
    const post = vi.spyOn(container.rest, "post").mockResolvedValue(message({ id: "2" }));

    await new Message(message()).reply("hi");

    expect(post).toHaveBeenCalledWith(
      Routes.channelMessages(channelId),
      expect.objectContaining({
        body: expect.objectContaining({
          message_reference: expect.objectContaining({ fail_if_not_exists: false }),
        }),
      }),
    );
  });

  test("GIVEN pin THEN the structure and the cache are patched", async () => {
    const client = createClient();
    const key = messageKey(channelId, "1200000000000000000");
    await client.cache!.messages.set(key, message());
    vi.spyOn(container.rest, "put").mockResolvedValue(undefined);

    const msg = await new Message(message()).pin();

    expect(msg.pinned).toBe(true);
    expect((await client.cache!.messages.get(key))?.pinned).toBe(true);
  });

  test("GIVEN react with a custom emoji THEN it targets the own reaction route and returns the reaction", async () => {
    createClient();
    const put = vi.spyOn(container.rest, "put").mockResolvedValue(undefined);
    const msg = new Message(message());

    const reaction = await msg.react("<:howl:123456789012345678>");

    expect(put).toHaveBeenCalledWith(
      Routes.channelMessageOwnReaction(channelId, "1200000000000000000", "howl:123456789012345678"),
      { signal: undefined },
    );
    expect(reaction).toBeInstanceOf(MessageReaction);
    expect(reaction.count).toBe(1);
    expect(reaction.me).toBe(true);
    expect(reaction.emoji.id).toBe("123456789012345678");
    expect(reaction.message).toBe(msg);
    expect(msg.reactions.cache.size).toBe(1);
  });

  test("GIVEN react with an emoji the bot already used THEN the count is unchanged", async () => {
    createClient();
    vi.spyOn(container.rest, "put").mockResolvedValue(undefined);
    const msg = new Message(message());

    await msg.react("🐺");
    const reaction = await msg.react("🐺");

    expect(reaction.count).toBe(1);
    expect(msg.reactions.cache.size).toBe(1);
  });

  test("GIVEN react on a cached message THEN the cached reactions follow", async () => {
    const client = createClient();
    vi.spyOn(container.rest, "put").mockResolvedValue(undefined);
    const key = messageKey(channelId, "1200000000000000000");
    await client.cache!.messages.set(key, message());
    const msg = await client.messages.fetch(channelId, "1200000000000000000");

    await msg.react("🐺");

    expect((await client.cache!.messages.get(key))?.reactions).toMatchObject([
      { count: 1, me: true, emoji: { name: "🐺" } },
    ]);
  });

  test("GIVEN MessageReaction#react THEN it returns itself with the bot counted", async () => {
    createClient();
    vi.spyOn(container.rest, "put").mockResolvedValue(undefined);
    const msg = new Message(
      message({
        reactions: [
          {
            count: 2,
            count_details: { normal: 2, burst: 0 },
            me: false,
            me_burst: false,
            burst_colors: [],
            emoji: { id: null, name: "🐺" },
          },
        ],
      }),
    );
    const reaction = msg.reactions.resolve("🐺")!;

    expect(await reaction.react()).toBe(reaction);
    expect(reaction.count).toBe(3);
    expect(reaction.me).toBe(true);
    expect(msg.reactions.resolve("🐺")?.count).toBe(3);
  });

  test("GIVEN suppressEmbeds THEN it edits the flags", async () => {
    createClient();
    const patch = vi
      .spyOn(container.rest, "patch")
      .mockResolvedValue(message({ flags: MessageFlags.SuppressEmbeds }));

    const msg = await new Message(message()).suppressEmbeds();

    expect(patch.mock.calls[0]![1]).toMatchObject({
      body: { flags: MessageFlags.SuppressEmbeds },
    });
    expect(msg.flags.has(MessageFlags.SuppressEmbeds)).toBe(true);
  });

  test("GIVEN equals THEN it compares content and embeds", () => {
    const msg = new Message(message({ embeds: [{ title: "a" }] }));
    expect(msg.equals(message({ embeds: [{ title: "a" }] }))).toBe(true);
    expect(msg.equals(message({ embeds: [{ title: "b" }] }))).toBe(false);
  });
});

describe("ReactionEmoji", () => {
  test.each([
    ["🐺", encodeURIComponent("🐺")],
    ["<a:howl:123456789012345678>", "a:howl:123456789012345678"],
    ["123456789012345678", "_:123456789012345678"],
    [{ id: null, name: "🐺" }, encodeURIComponent("🐺")],
  ])("GIVEN %s THEN it resolves to %s", (emoji, identifier) => {
    expect(ReactionEmoji.resolveIdentifier(emoji as never)).toBe(identifier);
  });
});

describe("MessageManager", () => {
  test("GIVEN bulkDelete with filterOld THEN old messages are dropped", async () => {
    const client = createClient();
    const post = vi.spyOn(container.rest, "post").mockResolvedValue(undefined);
    // A snowflake from 2015, and two from now.
    const fresh = String((BigInt(Date.now() - 1_420_070_400_000) << 22n) + 1n);
    const fresher = String((BigInt(Date.now() - 1_420_070_400_000) << 22n) + 2n);

    const deleted = await client.messages.bulkDelete(channelId, ["1", fresh, fresher], true);

    expect(deleted).toEqual([fresh, fresher]);
    expect(post).toHaveBeenCalledWith(Routes.channelBulkDelete(channelId), {
      body: { messages: [fresh, fresher] },
    });
  });

  test("GIVEN fetchPins THEN it caches the messages with their pin time", async () => {
    const client = createClient();
    vi.spyOn(container.rest, "get").mockResolvedValue({
      items: [{ message: message({ pinned: true }), pinned_at: "2026-01-01T00:00:00.000Z" }],
      has_more: false,
    });

    const { items, hasMore } = await client.messages.fetchPins(channelId);

    expect(hasMore).toBe(false);
    expect(items[0]!.pinnedTimestamp).toBe(Date.parse("2026-01-01T00:00:00.000Z"));
    expect(
      await client.cache!.messages.get(messageKey(channelId, "1200000000000000000")),
    ).toBeDefined();
  });

  test("GIVEN a text channel THEN it sends through the channel", async () => {
    createClient();
    const post = vi.spyOn(container.rest, "post").mockResolvedValue(message());
    const channel = createChannel({
      id: channelId,
      type: ChannelType.GuildText,
      name: "general",
      guild_id: guildId,
    } as never) as TextChannel;

    await channel.send("hello");
    await channel.sendTyping();

    expect(post).toHaveBeenCalledWith(Routes.channelMessages(channelId), {
      body: { content: "hello" },
      files: undefined,
    });
    expect(post).toHaveBeenCalledWith(Routes.channelTyping(channelId), { signal: undefined });
    expect(channel.messages.channelId).toBe(channelId);
  });
});

describe("Message#fetchCrosspostable", () => {
  test("GIVEN a message outside of an announcement channel THEN it is not crosspostable", async () => {
    createClient();
    vi.spyOn(container.rest, "get").mockResolvedValue({
      id: channelId,
      type: ChannelType.GuildText,
      name: "general",
      guild_id: guildId,
    });

    await expect(new Message(message({ guild_id: guildId })).fetchCrosspostable()).resolves.toBe(
      false,
    );
  });

  test("GIVEN the bot's message in an announcement channel THEN it is crosspostable", async () => {
    createClient();
    vi.spyOn(container.rest, "get").mockResolvedValue({
      id: channelId,
      type: ChannelType.GuildAnnouncement,
      name: "news",
      guild_id: guildId,
    });

    await expect(new Message(message({ guild_id: guildId })).fetchCrosspostable()).resolves.toBe(
      true,
    );
  });
});
