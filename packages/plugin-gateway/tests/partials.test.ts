import { WebSocketShardEvents } from "@discordjs/ws";
import { container } from "@wolfstar/http-framework";
import { createInMemoryCache } from "@wolfstar/plugin-cache";
import {
  GatewayDispatchEvents,
  GatewayOpcodes,
  MessageType,
  ReactionType,
  type GatewayDispatchPayload,
} from "discord-api-types/v10";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  DMChannel,
  GatewayClient,
  GuildMember,
  GuildScheduledEvent,
  Message,
  Partials,
  SoundboardSound,
  ThreadMember,
  User,
  type GatewayEventMap,
  type GatewayEventName,
} from "../src/index.js";

const guildId = "100000000000000010";
const channelId = "200000000000000020";
const userId = "300000000000000030";

function createClient(partials: readonly Partials[] = [], cache = true) {
  return new GatewayClient({
    discordPublicKey: "0".repeat(64),
    discordToken: "test-token",
    clientId: "266624760782258186",
    intents: 0,
    cache: cache ? createInMemoryCache() : null,
    partials,
  });
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

const user = { id: userId, username: "wolf", discriminator: "0", global_name: null, avatar: null };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Partials", () => {
  test("GIVEN a message without content or without author THEN it is partial", () => {
    const author = {
      id: "1",
      username: "wolf",
      discriminator: "0",
      global_name: null,
      avatar: null,
    };

    expect(new Message({ id: "3", channel_id: "20", author } as never).partial).toBe(true);
    expect(new Message({ id: "3", channel_id: "20", content: "hi" } as never).partial).toBe(true);
    expect(new Message({ id: "3", channel_id: "20", author, content: "" } as never).partial).toBe(
      false,
    );
  });

  test("GIVEN the options THEN the client exposes a frozen copy", () => {
    const partials = [Partials.Message];
    const client = createClient(partials);
    partials.push(Partials.User);
    expect(client.partials).toEqual([Partials.Message]);
    expect(Object.isFrozen(client.partials)).toBe(true);
    expect(createClient().partials).toEqual([]);
  });

  test("GIVEN no partials THEN uncached entities stay null", async () => {
    const client = createClient();
    const deletes = record(client, "messageDelete");
    const removes = record(client, "guildMemberRemove");

    await dispatch(client, GatewayDispatchEvents.MessageDelete, {
      id: "1",
      channel_id: channelId,
      guild_id: guildId,
    });
    await dispatch(client, GatewayDispatchEvents.GuildMemberRemove, { guild_id: guildId, user });

    expect(deletes[0]![0]).toBeNull();
    expect(removes[0]![0]).toBeNull();
  });

  test("GIVEN Partials.Message THEN an uncached deleted message is partial", async () => {
    const client = createClient([Partials.Message], false);
    const calls = record(client, "messageDelete");

    await dispatch(client, GatewayDispatchEvents.MessageDelete, {
      id: "1",
      channel_id: channelId,
      guild_id: guildId,
    });

    const [[message]] = calls;
    expect(message).toBeInstanceOf(Message);
    expect(message!.partial).toBe(true);
    expect(message!.id).toBe("1");
    expect(message!.channelId).toBe(channelId);
    expect(message!.guildId).toBe(guildId);
    expect(message!.client).toBe(client);
    expect(message!.embeds).toEqual([]);
    expect(message!.attachments.size).toBe(0);
  });

  test("GIVEN Partials.Message THEN bulk deletes list cached and partial messages in order", async () => {
    const client = createClient([Partials.Message]);
    await client.messages._add({
      id: "2",
      channel_id: channelId,
      author: user,
      content: "cached",
      timestamp: new Date(0).toISOString(),
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
    const calls = record(client, "messageDeleteBulk");

    await dispatch(client, GatewayDispatchEvents.MessageDeleteBulk, {
      ids: ["1", "2"],
      channel_id: channelId,
    });

    const [[messages]] = calls;
    expect(messages.map((message) => [message.id, message.partial])).toEqual([
      ["1", true],
      ["2", false],
    ]);
  });

  test("GIVEN Partials.GuildMember THEN a removed uncached member is partial with the removal's user", async () => {
    const client = createClient([Partials.GuildMember]);
    const calls = record(client, "guildMemberRemove");

    await dispatch(client, GatewayDispatchEvents.GuildMemberRemove, { guild_id: guildId, user });

    const [[member]] = calls;
    expect(member).toBeInstanceOf(GuildMember);
    expect(member!.partial).toBe(true);
    expect(member!.id).toBe(userId);
    expect(member!.guildId).toBe(guildId);
    expect(member!.user?.username).toBe("wolf");
  });

  test("GIVEN Partials.User and Partials.Message THEN reactions carry a partial user and message", async () => {
    const client = createClient([Partials.User, Partials.Message]);
    const calls = record(client, "messageReactionAdd");

    await dispatch(client, GatewayDispatchEvents.MessageReactionAdd, {
      user_id: userId,
      channel_id: channelId,
      message_id: "1",
      emoji: { id: null, name: "🐺" },
      type: ReactionType.Normal,
      burst: false,
    });

    const [[reaction, reactor]] = calls;
    expect(reaction.partial).toBe(true);
    expect(reaction.message?.partial).toBe(true);
    expect(reaction.message?.id).toBe("1");
    expect(reactor).toBeInstanceOf(User);
    expect(reactor!.partial).toBe(true);
    expect(reactor!.id).toBe(userId);
  });

  test("GIVEN Partials.ThreadMember THEN removed uncached thread members are partial", async () => {
    const client = createClient([Partials.ThreadMember]);
    const calls = record(client, "threadMembersUpdate");

    await dispatch(client, GatewayDispatchEvents.ThreadMembersUpdate, {
      id: channelId,
      guild_id: guildId,
      member_count: 0,
      removed_member_ids: [userId],
    });

    const [[, removed]] = calls;
    expect(removed).toHaveLength(1);
    expect(removed[0]).toBeInstanceOf(ThreadMember);
    expect(removed[0]!.partial).toBe(true);
    expect(removed[0]!.id).toBe(userId);
    expect(removed[0]!.threadId).toBe(channelId);
  });

  test("GIVEN Partials.GuildScheduledEvent THEN a user add on an uncached event is partial", async () => {
    const client = createClient([Partials.GuildScheduledEvent, Partials.User]);
    const calls = record(client, "guildScheduledEventUserAdd");

    await dispatch(client, GatewayDispatchEvents.GuildScheduledEventUserAdd, {
      guild_scheduled_event_id: "7",
      user_id: userId,
      guild_id: guildId,
    });

    const [[event, subscriber]] = calls;
    expect(event).toBeInstanceOf(GuildScheduledEvent);
    expect(event!.partial).toBe(true);
    expect(event!.id).toBe("7");
    expect(subscriber!.partial).toBe(true);
  });

  test("GIVEN Partials.SoundboardSound THEN an uncached deleted sound is partial", async () => {
    const client = createClient([Partials.SoundboardSound]);
    const calls = record(client, "guildSoundboardSoundDelete");

    await dispatch(client, GatewayDispatchEvents.GuildSoundboardSoundDelete, {
      sound_id: "9",
      guild_id: guildId,
    });

    const [[sound]] = calls;
    expect(sound).toBeInstanceOf(SoundboardSound);
    expect(sound!.partial).toBe(true);
    expect(sound!.soundId).toBe("9");
  });

  test("GIVEN Partials.Poll THEN a vote on an uncached message has a partial poll", async () => {
    const client = createClient([Partials.Poll]);
    const calls = record(client, "messagePollVoteAdd");

    await dispatch(client, GatewayDispatchEvents.MessagePollVoteAdd, {
      user_id: userId,
      channel_id: channelId,
      message_id: "1",
      answer_id: 2,
    });

    const [[answer]] = calls;
    expect(answer.partial).toBe(true);
    expect(answer.poll?.partial).toBe(true);
    expect(answer.poll?.messageId).toBe("1");
    expect(answer.poll?.answers).toEqual([]);
    expect(answer.poll?.question).toEqual({ text: null, emoji: null });
  });

  test("GIVEN Partials.Channel THEN typing in an uncached direct message has a partial channel", async () => {
    const client = createClient([Partials.Channel, Partials.User]);
    const calls = record(client, "typingStart");

    await dispatch(client, GatewayDispatchEvents.TypingStart, {
      channel_id: channelId,
      user_id: userId,
      timestamp: 1_700_000_000,
    });

    const [[typing]] = calls;
    expect(typing.channel).toBeInstanceOf(DMChannel);
    expect(typing.channel!.partial).toBe(true);
    expect((typing.channel as DMChannel).recipientId).toBe(userId);
    expect(typing.user?.partial).toBe(true);
  });

  test("GIVEN a partial message THEN fetch completes it", async () => {
    const client = createClient([Partials.Message]);
    const calls = record(client, "messageDelete");
    await dispatch(client, GatewayDispatchEvents.MessageDelete, { id: "1", channel_id: channelId });
    vi.spyOn(container.rest, "get").mockResolvedValue({
      id: "1",
      channel_id: channelId,
      author: user,
      content: "Awoo",
      timestamp: new Date(0).toISOString(),
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

    const message = await calls[0]![0]!.fetch();

    expect(message.partial).toBe(false);
    expect(message.content).toBe("Awoo");
  });
});
