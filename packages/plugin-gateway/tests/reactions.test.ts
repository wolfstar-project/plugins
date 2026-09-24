import { WebSocketShardEvents } from "@discordjs/ws";
import { createInMemoryCache } from "@wolfstar/plugin-cache";
import {
  GatewayDispatchEvents,
  GatewayOpcodes,
  MessageType,
  type APIUser,
  type GatewayDispatchPayload,
} from "discord-api-types/v10";
import { describe, expect, test } from "vitest";
import {
  GatewayClient,
  MessageReaction,
  PollAnswer,
  User,
  type GatewayEventMap,
  type GatewayEventName,
} from "../src/index.js";

const botId = "266624760782258186";
const user: APIUser = {
  id: "600000000000000600",
  username: "wolf",
  discriminator: "0",
  global_name: null,
  avatar: null,
};
const wolf = { id: null, name: "🐺" };

function createClient() {
  return new GatewayClient({
    discordPublicKey: "0".repeat(64),
    discordToken: "test-token",
    clientId: botId,
    intents: 0,
    cache: createInMemoryCache(),
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

async function createMessage(client: GatewayClient, extra: Record<string, unknown> = {}) {
  await dispatch(client, GatewayDispatchEvents.MessageCreate, {
    id: "30",
    channel_id: "20",
    guild_id: "10",
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
  });
}

function reaction(userId: string, extra: Record<string, unknown> = {}) {
  return {
    user_id: userId,
    channel_id: "20",
    message_id: "30",
    guild_id: "10",
    emoji: wolf,
    burst: false,
    type: 0,
    ...extra,
  };
}

describe("reaction events", () => {
  test("GIVEN a reaction on a cached message THEN the event has the counted reaction and the user", async () => {
    const client = createClient();
    await createMessage(client);
    const calls = record(client, "messageReactionAdd");

    await dispatch(client, GatewayDispatchEvents.MessageReactionAdd, reaction(botId));
    await dispatch(
      client,
      GatewayDispatchEvents.MessageReactionAdd,
      reaction(user.id, {
        member: { user, roles: [], joined_at: "2026-01-01T00:00:00.000Z" },
      }),
    );

    const [first, second] = calls;
    expect(first![0].count).toBe(1);
    expect(first![0].me).toBe(true);
    expect(first![2]).toEqual({ userId: botId, type: 0, burst: false });
    expect(second![0].count).toBe(2);
    expect(second![1]).toBeInstanceOf(User);
    const cached = await client.messages.get("20", "30");
    expect(cached?.reactions.resolve("🐺")?.count).toBe(2);
  });

  test("GIVEN a reaction on an uncached message THEN the reaction has no counts", async () => {
    const client = createClient();
    const calls = record(client, "messageReactionAdd");

    await dispatch(client, GatewayDispatchEvents.MessageReactionAdd, reaction(user.id));

    const [[emitted, emittedUser, details]] = calls;
    expect(emitted).toBeInstanceOf(MessageReaction);
    expect(emitted.count).toBeNull();
    expect(emittedUser).toBeNull();
    expect(details.userId).toBe(user.id);
  });

  test("GIVEN the last reaction of an emoji removed from a cached message THEN its count is 0", async () => {
    const client = createClient();
    await createMessage(client);
    await dispatch(client, GatewayDispatchEvents.MessageReactionAdd, reaction(user.id));
    const calls = record(client, "messageReactionRemove");

    await dispatch(client, GatewayDispatchEvents.MessageReactionRemove, reaction(user.id));

    expect(calls[0]![0].count).toBe(0);
  });

  test("GIVEN REMOVE_ALL and REMOVE_EMOJI THEN the removed reactions are emitted", async () => {
    const client = createClient();
    await createMessage(client);
    await dispatch(client, GatewayDispatchEvents.MessageReactionAdd, reaction(user.id));
    const emoji = record(client, "messageReactionRemoveEmoji");
    const all = record(client, "messageReactionRemoveAll");

    await dispatch(client, GatewayDispatchEvents.MessageReactionRemoveEmoji, {
      channel_id: "20",
      message_id: "30",
      guild_id: "10",
      emoji: wolf,
    });
    await dispatch(client, GatewayDispatchEvents.MessageReactionAdd, reaction(user.id));
    await dispatch(client, GatewayDispatchEvents.MessageReactionRemoveAll, {
      channel_id: "20",
      message_id: "30",
      guild_id: "10",
    });

    expect(emoji[0]![0].count).toBe(1);
    const [[message, removed]] = all;
    expect(removed.map((r) => r.emoji.name)).toEqual(["🐺"]);
    expect(message?.reactions.cache).toEqual([]);
  });
});

describe("poll vote events", () => {
  test("GIVEN votes on a cached poll THEN the answer has its text and count", async () => {
    const client = createClient();
    await createMessage(client, {
      poll: {
        question: { text: "Best pack?" },
        answers: [{ answer_id: 1, poll_media: { text: "Ours" } }],
        expiry: null,
        allow_multiselect: false,
        layout_type: 1,
      },
    });
    const added = record(client, "messagePollVoteAdd");
    const removed = record(client, "messagePollVoteRemove");
    const vote = { user_id: user.id, channel_id: "20", message_id: "30", answer_id: 1 };

    await dispatch(client, GatewayDispatchEvents.MessagePollVoteAdd, vote);
    await dispatch(client, GatewayDispatchEvents.MessagePollVoteRemove, vote);

    expect(added[0]![0].text).toBe("Ours");
    expect(added[0]![0].voteCount).toBe(1);
    expect(added[0]![1]).toBe(user.id);
    expect(removed[0]![0].voteCount).toBe(0);
  });

  test("GIVEN a vote on an uncached message THEN the answer only has its ID", async () => {
    const client = createClient();
    const calls = record(client, "messagePollVoteAdd");

    await dispatch(client, GatewayDispatchEvents.MessagePollVoteAdd, {
      user_id: user.id,
      channel_id: "20",
      message_id: "30",
      answer_id: 2,
    });

    const [[answer]] = calls;
    expect(answer).toBeInstanceOf(PollAnswer);
    expect(answer.id).toBe(2);
    expect(answer.text).toBeNull();
  });
});
