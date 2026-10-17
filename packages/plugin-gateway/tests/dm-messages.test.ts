import { container } from "@wolfstar/http-framework";
import { createInMemoryCache } from "@wolfstar/plugin-cache";
import {
  ChannelType,
  MessageType,
  Routes,
  type APIMessage,
  type APIUser,
} from "discord-api-types/v10";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  ChannelMessageManager,
  createChannel,
  GatewayClient,
  type DMChannel,
  type GatewayClientOptions,
  type GroupDMChannel,
  type TextChannel,
} from "../src/index.js";
import { cacheModes, type CacheMode } from "./fixtures/cacheModes.js";

const dmId = "300000000000000030";
const groupDmId = "300000000000000031";
const guildId = "100000000000000010";
const guildChannelId = "200000000000000020";
const messageId = "1200000000000000000";
const wolf: APIUser = {
  id: "600000000000000600",
  username: "wolf",
  discriminator: "0",
  global_name: "Wolf",
  avatar: null,
};

function createClient(options: Partial<GatewayClientOptions> = { cache: createInMemoryCache() }) {
  return new GatewayClient({
    discordPublicKey: "0".repeat(64),
    discordToken: "test-token",
    clientId: "266624760782258186",
    intents: 0,
    ...options,
  });
}

// A message of a direct message: no `guild_id`, and no `member` on its author.
function dmMessage(extra: Partial<APIMessage> = {}): APIMessage {
  return {
    id: messageId,
    channel_id: dmId,
    author: wolf,
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

function dmChannel() {
  return createChannel({
    id: dmId,
    type: ChannelType.DM,
    recipients: [wolf],
  } as never) as DMChannel;
}

function groupDmChannel() {
  return createChannel({
    id: groupDmId,
    type: ChannelType.GroupDM,
    recipients: [wolf],
  } as never) as GroupDMChannel;
}

function guildChannel(type = ChannelType.GuildAnnouncement) {
  return createChannel({
    id: guildChannelId,
    type,
    name: "news",
    guild_id: guildId,
  } as never) as TextChannel;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each(Object.keys(cacheModes) as CacheMode[])(
  "messages of a direct message with a %s cache",
  (mode) => {
    test("GIVEN a direct message THEN fetch, send, edit, delete and pin go through its channel", async () => {
      createClient(cacheModes[mode]());
      const channel = dmChannel();
      const get = vi.spyOn(container.rest, "get").mockResolvedValue(dmMessage());
      const post = vi.spyOn(container.rest, "post").mockResolvedValue(dmMessage({ id: "2" }));
      const patch = vi
        .spyOn(container.rest, "patch")
        .mockResolvedValue(dmMessage({ content: "edited" }));
      const del = vi.spyOn(container.rest, "delete").mockResolvedValue(undefined);
      const put = vi.spyOn(container.rest, "put").mockResolvedValue(undefined);

      const fetched = await channel.messages.fetch(messageId);
      const sent = await channel.messages.send("hi");
      const edited = await channel.messages.edit(messageId, "edited");
      await channel.messages.pin(messageId);
      await channel.messages.unpin(messageId);
      await channel.messages.delete(messageId);

      expect(get).toHaveBeenCalledWith(Routes.channelMessage(dmId, messageId), expect.anything());
      expect(post).toHaveBeenCalledWith(Routes.channelMessages(dmId), {
        body: { content: "hi" },
        files: undefined,
      });
      expect(patch).toHaveBeenCalledWith(Routes.channelMessage(dmId, messageId), {
        body: { content: "edited" },
        files: undefined,
      });
      expect(put).toHaveBeenCalledWith(Routes.channelPin(dmId, messageId), expect.anything());
      expect(del).toHaveBeenCalledWith(Routes.channelPin(dmId, messageId), expect.anything());
      expect(del).toHaveBeenCalledWith(Routes.channelMessage(dmId, messageId), expect.anything());
      // Out of a guild: no guild, no member, and the author is the user.
      for (const message of [fetched, sent, edited]) {
        expect(message.guildId).toBeNull();
        expect(message.inGuild()).toBe(false);
        expect(message.author.id).toBe(wolf.id);
      }
      expect(edited.content).toBe("edited");
    });

    test("GIVEN a cached direct message THEN pinning patches it and deleting drops it", async () => {
      const client = createClient(cacheModes[mode]());
      const channel = dmChannel();
      vi.spyOn(container.rest, "put").mockResolvedValue(undefined);
      vi.spyOn(container.rest, "delete").mockResolvedValue(undefined);
      await client.messages._add(dmMessage());

      await channel.messages.pin(messageId);
      await channel.messages.delete(messageId);

      expect(await channel.messages.cache.get(messageId)).toBeUndefined();
    });
  },
);

describe("guild-only paths of the messages of a direct message", () => {
  test.each([
    ["a direct message", dmChannel, dmId],
    ["a group direct message", groupDmChannel, groupDmId],
  ])(
    "GIVEN %s THEN crosspost, bulkDelete and startThread throw before any request",
    async (_, build, id) => {
      createClient();
      const { messages } = build();
      const post = vi.spyOn(container.rest, "post").mockResolvedValue(dmMessage());
      const del = vi.spyOn(container.rest, "delete").mockResolvedValue(undefined);
      const get = vi.spyOn(container.rest, "get").mockResolvedValue([]);

      const errors = await Promise.all([
        messages.crosspost(messageId).catch((e) => e),
        messages.bulkDelete([messageId, "2"]).catch((e) => e),
        messages.bulkDelete(5).catch((e) => e),
        messages.startThread(messageId, { name: "hunt" }).catch((e) => e),
      ]);

      const actions = ["crosspost", "bulkDelete", "bulkDelete", "startThread"];
      for (const [index, action] of actions.entries()) {
        expect(errors[index]).toMatchObject({
          name: "GatewayError [ChannelMessagesGuildOnly]",
          code: "ChannelMessagesGuildOnly",
          message: `${action} is only available in guild channels, and channel ${id} is a direct message`,
        });
      }
      expect(post).not.toHaveBeenCalled();
      expect(del).not.toHaveBeenCalled();
      expect(get).not.toHaveBeenCalled();
    },
  );

  test("GIVEN a message of a direct message THEN crosspostable and threadable are false", async () => {
    const client = createClient();
    const message = await client.messages._build(dmMessage());

    expect(message.crosspostable).toBe(false);
    expect(message.threadable).toBe(false);
  });

  test("GIVEN an announcement channel THEN crosspost publishes the message", async () => {
    createClient();
    const post = vi
      .spyOn(container.rest, "post")
      .mockResolvedValue(dmMessage({ channel_id: guildChannelId, guild_id: guildId }));

    const message = await guildChannel().messages.crosspost(messageId);

    expect(post).toHaveBeenCalledWith(
      Routes.channelMessageCrosspost(guildChannelId, messageId),
      expect.anything(),
    );
    expect(message.guildId).toBe(guildId);
  });

  test("GIVEN a guild channel THEN bulkDelete and startThread are not refused", async () => {
    createClient();
    vi.spyOn(container.rest, "post").mockResolvedValue({});
    vi.spyOn(container.rest, "delete").mockResolvedValue(undefined);
    const { messages } = guildChannel(ChannelType.GuildText);

    await expect(messages.bulkDelete([messageId])).resolves.toBeDefined();
    await expect(messages.startThread(messageId, { name: "hunt" })).resolves.toBeDefined();
  });

  test("GIVEN a manager built without the channel type THEN the request is left to Discord", async () => {
    const client = createClient();
    const post = vi.spyOn(container.rest, "post").mockResolvedValue(dmMessage());

    await new ChannelMessageManager(client, dmId).crosspost(messageId);

    expect(post).toHaveBeenCalledTimes(1);
  });

  test("GIVEN the client-level manager THEN it does not guard by channel", async () => {
    const client = createClient();
    const post = vi.spyOn(container.rest, "post").mockResolvedValue(dmMessage());

    await client.messages.crosspost(dmId, messageId);

    expect(post).toHaveBeenCalledTimes(1);
  });
});
