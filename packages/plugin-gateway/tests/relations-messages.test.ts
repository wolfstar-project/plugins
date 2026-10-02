import { WebSocketShardEvents } from "@discordjs/ws";
import { createInMemoryCache, emojiKey, memberKey, roleKey } from "@wolfstar/plugin-cache";
import {
  ChannelType,
  GatewayDispatchEvents,
  GatewayOpcodes,
  MessageFlags,
  MessageType,
  type APIMessage,
  type APIUser,
  type GatewayDispatchPayload,
} from "discord-api-types/v10";
import { describe, expect, test } from "vitest";
import {
  GatewayClient,
  GuildEmoji,
  ReactionEmoji,
  kPatch,
  type GatewayEventMap,
} from "../src/index.js";

const guildId = "100000000000000010";
const channelId = "200000000000000020";
const otherChannelId = "200000000000000021";
const messageId = "1200000000000000000";
const roleId = "700000000000000070";
const emojiId = "900000000000000090";
const author: APIUser = {
  id: "600000000000000600",
  username: "wolf",
  discriminator: "0",
  global_name: "Wolf",
  avatar: null,
};
const mentioned: APIUser = {
  id: "700000000000000700",
  username: "stale",
  discriminator: "0",
  global_name: null,
  avatar: null,
};

function createClient(cache = true) {
  return new GatewayClient({
    discordPublicKey: "0".repeat(64),
    discordToken: "test-token",
    clientId: author.id,
    intents: 0,
    cache: cache ? createInMemoryCache() : null,
  });
}

async function dispatch(client: GatewayClient, t: GatewayDispatchEvents, d: unknown) {
  const payload = { op: GatewayOpcodes.Dispatch, s: 1, t, d } as GatewayDispatchPayload;
  client.gateway.emit(WebSocketShardEvents.Dispatch, payload, 0);
  await client.idle();
}

function message(extra: Partial<APIMessage> & { guild_id?: string } = {}): APIMessage {
  return {
    id: messageId,
    channel_id: channelId,
    guild_id: guildId,
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
  } as APIMessage;
}

async function seed(client: GatewayClient) {
  const cache = client.cache!;
  await cache.guilds.set(guildId, { id: guildId, name: "Pack", features: [], icon: null } as never);
  for (const [id, name] of [
    [channelId, "general"],
    [otherChannelId, "den"],
  ] as const) {
    await cache.channels.set(id, {
      id,
      type: ChannelType.GuildText,
      name,
      guild_id: guildId,
    } as never);
  }

  await cache.users.set(mentioned.id, { ...mentioned, username: "howl" } as never);
  await cache.members.set(memberKey(guildId, mentioned.id), {
    user: mentioned,
    roles: [],
    joined_at: "2026-01-01T00:00:00.000Z",
    nick: "Beta",
    deaf: false,
    mute: false,
    guild_id: guildId,
  } as never);
  await cache.roles.set(roleKey(guildId, roleId), {
    id: roleId,
    name: "Alpha",
    guild_id: guildId,
    color: 0,
    hoist: false,
    position: 1,
    permissions: "0",
    managed: false,
    mentionable: true,
    flags: 0,
  } as never);
  await cache.emojis.set(emojiKey(guildId, emojiId), {
    id: emojiId,
    name: "howl",
    roles: [],
    animated: false,
    guild_id: guildId,
  } as never);
}

const mentioning = message({
  content: `<@${mentioned.id}> <@&${roleId}> <#${otherChannelId}> <#299999999999999999>`,
  mentions: [
    {
      ...mentioned,
      member: { roles: [], joined_at: "2026-01-01T00:00:00.000Z", deaf: false, mute: false },
    } as never,
  ],
  mention_roles: [roleId],
});

describe("message mentions", () => {
  test("GIVEN cached entities THEN mentions resolve them, and cleanContent names them", async () => {
    const client = createClient();
    await seed(client);

    const resolved = await client.messages._build(mentioning);
    const { mentions } = resolved;

    expect(mentions.users[0]!.username).toBe("howl");
    expect(mentions.members[0]!.nickname).toBe("Beta");
    expect(mentions.parsedUsers.get(mentioned.id)?.username).toBe("howl");
    expect(mentions.roles.get(roleId)?.name).toBe("Alpha");
    expect([...mentions.channels.keys()]).toEqual([otherChannelId]);
    expect(mentions.guild?.id).toBe(guildId);
    expect(resolved.cleanContent).toBe("@Beta @Alpha #den <#299999999999999999>");
  });

  test("GIVEN no cache THEN mentions fall back to the payload", async () => {
    const client = createClient(false);

    const built = await client.messages._build(mentioning);
    const { mentions } = built;

    expect(mentions.users[0]!.username).toBe("stale");
    expect(mentions.roles.size).toBe(0);
    expect(mentions.channels.size).toBe(0);
    expect(built.cleanContent).toBe(
      `@stale <@&${roleId}> <#${otherChannelId}> <#299999999999999999>`,
    );
  });

  test("GIVEN a content patch THEN the resolved mentions are dropped", async () => {
    const client = createClient();
    await seed(client);
    const resolved = await client.messages._build(mentioning);

    resolved[kPatch]({ content: "quiet", mentions: [], mention_roles: [] });

    expect(resolved.mentions.roles.size).toBe(0);
    expect(resolved.mentions.users).toEqual([]);
  });
});

describe("message thread, reactions, and poll", () => {
  const thread = {
    id: messageId,
    type: ChannelType.PublicThread,
    name: "fresh",
    guild_id: guildId,
    parent_id: channelId,
    thread_metadata: {
      archived: false,
      locked: false,
      auto_archive_duration: 1440,
      archive_timestamp: "2026-01-01T00:00:00.000Z",
    },
  };

  test("GIVEN a cached thread THEN message.thread prefers it over the payload's copy", async () => {
    const client = createClient();
    await seed(client);
    await client.cache!.threads.set(messageId, thread as never);

    const withCopy = await client.messages._build(
      message({ thread: { ...thread, name: "stale" } } as never),
    );
    const flagged = await client.messages._build(message({ flags: MessageFlags.HasThread }));

    expect(withCopy.thread?.name).toBe("fresh");
    expect(withCopy.thread?.parent?.id).toBe(channelId);
    expect(flagged.thread?.name).toBe("fresh");
  });

  test("GIVEN no cached thread THEN message.thread is the payload's copy, else null", async () => {
    const client = createClient();

    const withCopy = await client.messages._build(
      message({ thread: { ...thread, name: "stale" } } as never),
    );

    expect(withCopy.thread?.name).toBe("stale");
    expect((await client.messages._build(message())).thread).toBeNull();
  });

  test("GIVEN reactions THEN they know their message, and cached custom emojis resolve", async () => {
    const client = createClient();
    await seed(client);
    const resolved = await client.messages._build(
      message({
        reactions: [
          {
            count: 2,
            count_details: { normal: 2, burst: 0 },
            me: false,
            me_burst: false,
            burst_colors: [],
            emoji: { id: emojiId, name: "old_name" },
          },
          {
            count: 1,
            count_details: { normal: 1, burst: 0 },
            me: true,
            me_burst: false,
            burst_colors: [],
            emoji: { id: null, name: "🐺" },
          },
        ],
      }),
    );

    const [custom, unicode] = resolved.reactions.cache.values();

    expect(custom!.message).toBe(resolved);
    expect(custom!.emoji).toBeInstanceOf(GuildEmoji);
    expect(custom!.emoji.name).toBe("howl");
    expect(resolved.reactions.resolve(`old_name:${emojiId}`)).not.toBeNull();
    expect(unicode!.emoji).toBeInstanceOf(ReactionEmoji);
  });

  test("GIVEN a reaction on an uncached message THEN the cached emoji resolves, the message is null", async () => {
    const client = createClient();
    await seed(client);
    const calls: GatewayEventMap["messageReactionAdd"][] = [];
    client.on("messageReactionAdd", (...args) => calls.push(args));

    await dispatch(client, GatewayDispatchEvents.MessageReactionAdd, {
      user_id: author.id,
      channel_id: channelId,
      message_id: "1299999999999999999",
      guild_id: guildId,
      emoji: { id: emojiId, name: "howl" },
      burst: false,
      type: 0,
    });

    const [reaction] = calls[0]!;
    expect(reaction.message).toBeNull();
    expect(reaction.emoji).toBeInstanceOf(GuildEmoji);
  });

  test("GIVEN a poll THEN it knows its message and channel, and its answers their poll and emoji", async () => {
    const client = createClient();
    await seed(client);
    const resolved = await client.messages._build(
      message({
        poll: {
          question: { text: "Hunt?" },
          answers: [
            { answer_id: 1, poll_media: { text: "Yes", emoji: { id: emojiId, name: "howl" } } },
            { answer_id: 2, poll_media: { text: "No", emoji: { id: null, name: "🐺" } } },
          ],
          expiry: "2026-01-02T00:00:00.000Z",
          allow_multiselect: false,
          layout_type: 1,
        },
      } as never),
    );

    const poll = resolved.poll!;
    const [yes, no] = poll.answers;

    expect(poll.message).toBe(resolved);
    expect(poll.channel?.id).toBe(channelId);
    expect(yes!.poll).toBe(poll);
    expect(yes!.emoji).toBeInstanceOf(GuildEmoji);
    expect(no!.emoji).toBeInstanceOf(ReactionEmoji);
  });
});
