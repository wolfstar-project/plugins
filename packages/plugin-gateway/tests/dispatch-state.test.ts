import { WebSocketShardEvents } from "@discordjs/ws";
import { createInMemoryCache } from "@wolfstar/plugin-cache";
import {
  ChannelType,
  GatewayDispatchEvents,
  GatewayOpcodes,
  MessageType,
  type APIMessage,
  type APIUser,
  type GatewayDispatchPayload,
} from "discord-api-types/v10";
import { describe, expect, test, vi } from "vitest";
import {
  DispatchHandlers,
  DispatchStateCodecs,
  GatewayClient,
  MultiDispatchHandlers,
} from "../src/index.js";

export const guildId = "100000000000000010";
export const channelId = "200000000000000020";
export const author: APIUser = {
  id: "600000000000000600",
  username: "wolf",
  discriminator: "0",
  global_name: "Wolf",
  avatar: null,
};

export function message(extra: Partial<APIMessage> = {}): APIMessage {
  return {
    id: "1200000000000000000",
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
  };
}

/** A producer and a worker sharing one cache, like a gateway process and a worker sharing Redis. */
export function createPair() {
  const cache = createInMemoryCache();
  const options = {
    discordPublicKey: "0".repeat(64),
    discordToken: "test-token",
    clientId: "266624760782258186",
    intents: 0,
    cache,
  };
  return { producer: new GatewayClient(options), worker: new GatewayClient(options) };
}

export async function feed(
  client: GatewayClient,
  t: GatewayDispatchEvents,
  d: unknown,
  shardId = 0,
) {
  const payload = { op: GatewayOpcodes.Dispatch, s: 1, t, d } as GatewayDispatchPayload;
  client.gateway.emit(WebSocketShardEvents.Dispatch, payload, shardId);
  await client.idle();
}

export type Emitted = [event: string, ...args: unknown[]];

/** Every event a client emits, in order. */
export function recordAll(client: GatewayClient): Emitted[] {
  const calls: Emitted[] = [];
  const emit = client.emit.bind(client) as (event: string, ...args: unknown[]) => boolean;
  vi.spyOn(client, "emit").mockImplementation(((event: string, ...args: unknown[]) => {
    calls.push([event, ...args]);
    return emit(event, ...args);
  }) as never);
  const emitAndWait = client.emitAndWait.bind(client);
  vi.spyOn(client, "emitAndWait").mockImplementation(((event: string, args: readonly unknown[]) => {
    calls.push([event, ...args]);
    return emitAndWait(event, args);
  }) as never);
  return calls;
}

/** The events a listener of the client's public API sees: neither `raw` nor `dispatch`. */
export function visible(calls: readonly Emitted[]): Emitted[] {
  return calls.filter(([event]) => event !== "raw" && event !== "dispatch");
}

/** Structures compare by class and raw data, everything else as is. */
export function plain(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === "object" && typeof (value as any).toJSON === "function") {
    return [value.constructor.name, (value as any).toJSON()];
  }
  return value;
}

export type Dispatched = [payload: GatewayDispatchPayload, shardId: number, state: unknown];

export function captureDispatches(client: GatewayClient): Dispatched[] {
  const dispatched: Dispatched[] = [];
  client.on("dispatch", (...args) => void dispatched.push(args as Dispatched));
  return dispatched;
}

describe("the dispatch event", () => {
  test("GIVEN an update of a cached message THEN dispatch carries the previous state", async () => {
    const { producer } = createPair();
    const dispatched = captureDispatches(producer);

    await feed(producer, GatewayDispatchEvents.MessageCreate, message());
    await feed(producer, GatewayDispatchEvents.MessageUpdate, message({ content: "edited" }));

    const [create, update] = dispatched;
    expect(create![2]).toBeUndefined();
    expect((update![2] as { content: string }).content).toBe("hello");
  });
});

describe("DispatchStateCodecs", () => {
  test("GIVEN every handler with a before THEN it has a codec, and every codec a handler with a before", () => {
    const withBefore = [
      ...Object.entries(DispatchHandlers),
      ...Object.entries(MultiDispatchHandlers),
    ]
      .filter(([, handler]) => handler && "before" in handler && handler.before)
      .map(([type]) => type)
      .toSorted();

    expect(Object.keys(DispatchStateCodecs).toSorted()).toEqual(withBefore);
  });
});

interface Case {
  name: string;
  seed: [GatewayDispatchEvents, unknown][];
  update: [GatewayDispatchEvents, unknown];
}

const member = (extra: object = {}) => ({
  guild_id: guildId,
  user: author,
  roles: [],
  joined_at: "2026-01-01T00:00:00.000Z",
  deaf: false,
  mute: false,
  flags: 0,
  ...extra,
});
const reaction = {
  count: 1,
  count_details: { normal: 1, burst: 0 },
  me: false,
  me_burst: false,
  emoji: { id: null, name: "👍" },
  burst_colors: [],
};
const channel = (extra: object = {}) => ({
  id: channelId,
  type: ChannelType.GuildText,
  guild_id: guildId,
  name: "general",
  position: 0,
  permission_overwrites: [],
  ...extra,
});
const role = (extra: object = {}) => ({
  id: "300000000000000030",
  name: "mods",
  color: 0,
  hoist: false,
  position: 1,
  permissions: "0",
  managed: false,
  mentionable: false,
  flags: 0,
  ...extra,
});
const emoji = (extra: object = {}) => ({
  id: "400000000000000040",
  name: "wolf",
  roles: [],
  animated: false,
  available: true,
  ...extra,
});
const stage = (extra: object = {}) => ({
  id: "500000000000000050",
  guild_id: guildId,
  channel_id: "500000000000000051",
  topic: "a",
  privacy_level: 2,
  discoverable_disabled: false,
  guild_scheduled_event_id: null,
  ...extra,
});
const sound = (extra: object = {}) => ({
  sound_id: "700000000000000070",
  name: "howl",
  volume: 1,
  emoji_id: null,
  emoji_name: null,
  guild_id: guildId,
  available: true,
  ...extra,
});

const threadId = "800000000000000080";
const threadMember = {
  id: threadId,
  user_id: author.id,
  join_timestamp: "2026-01-01T00:00:00.000Z",
  flags: 0,
};

const cases: Case[] = [
  {
    name: "single, root manager (message)",
    seed: [[GatewayDispatchEvents.MessageCreate, message()]],
    update: [GatewayDispatchEvents.MessageUpdate, message({ content: "edited" })],
  },
  {
    name: "single, root manager (channel)",
    seed: [[GatewayDispatchEvents.ChannelCreate, channel()]],
    update: [GatewayDispatchEvents.ChannelUpdate, channel({ name: "renamed" })],
  },
  {
    name: "single, root manager (member)",
    seed: [[GatewayDispatchEvents.GuildMemberAdd, member()]],
    update: [GatewayDispatchEvents.GuildMemberUpdate, member({ nick: "alpha" })],
  },
  {
    name: "single, root manager (role)",
    seed: [[GatewayDispatchEvents.GuildRoleCreate, { guild_id: guildId, role: role() }]],
    update: [
      GatewayDispatchEvents.GuildRoleUpdate,
      { guild_id: guildId, role: role({ name: "admins" }) },
    ],
  },
  {
    name: "single, guild-scoped manager (stage instance)",
    seed: [[GatewayDispatchEvents.StageInstanceCreate, stage()]],
    update: [GatewayDispatchEvents.StageInstanceUpdate, stage({ topic: "b" })],
  },
  {
    name: "single, guild-scoped manager (soundboard sound)",
    seed: [[GatewayDispatchEvents.GuildSoundboardSoundCreate, sound()]],
    update: [GatewayDispatchEvents.GuildSoundboardSoundUpdate, sound({ name: "growl" })],
  },
  {
    name: "list, root manager (bulk deleted messages)",
    seed: [
      [GatewayDispatchEvents.MessageCreate, message({ id: "1200000000000000001" })],
      [GatewayDispatchEvents.MessageCreate, message({ id: "1200000000000000002" })],
    ],
    update: [
      GatewayDispatchEvents.MessageDeleteBulk,
      {
        ids: ["1200000000000000001", "1200000000000000002"],
        channel_id: channelId,
        guild_id: guildId,
      },
    ],
  },
  {
    name: "list, root manager with extra scope (removed thread members)",
    seed: [
      [
        GatewayDispatchEvents.ThreadMembersUpdate,
        { id: threadId, guild_id: guildId, member_count: 1, added_members: [threadMember] },
      ],
    ],
    update: [
      GatewayDispatchEvents.ThreadMembersUpdate,
      { id: threadId, guild_id: guildId, member_count: 0, removed_member_ids: [author.id] },
    ],
  },
  {
    name: "list, guild-scoped manager (emojis)",
    seed: [[GatewayDispatchEvents.GuildEmojisUpdate, { guild_id: guildId, emojis: [emoji()] }]],
    update: [
      GatewayDispatchEvents.GuildEmojisUpdate,
      { guild_id: guildId, emojis: [emoji({ name: "alpha" })] },
    ],
  },
  {
    name: "reaction collection",
    seed: [[GatewayDispatchEvents.MessageCreate, message({ reactions: [reaction] })]],
    update: [
      GatewayDispatchEvents.MessageReactionRemoveAll,
      { channel_id: channelId, message_id: message().id, guild_id: guildId },
    ],
  },
  {
    name: "single reaction",
    seed: [[GatewayDispatchEvents.MessageCreate, message({ reactions: [reaction] })]],
    update: [
      GatewayDispatchEvents.MessageReactionRemoveEmoji,
      {
        channel_id: channelId,
        message_id: message().id,
        guild_id: guildId,
        emoji: { id: null, name: "👍" },
      },
    ],
  },
  {
    name: "empty reaction collection (message without reactions)",
    seed: [[GatewayDispatchEvents.MessageCreate, message()]],
    update: [
      GatewayDispatchEvents.MessageReactionRemoveAll,
      { channel_id: channelId, message_id: message().id, guild_id: guildId },
    ],
  },
];

describe("state round trip", () => {
  test.each(cases)(
    "GIVEN $name THEN the worker emits what the producer did",
    async ({ seed, update }) => {
      const { producer, worker } = createPair();
      const produced = recordAll(producer);
      const replayed = recordAll(worker);
      const dispatched = captureDispatches(producer);

      for (const [type, data] of seed) await feed(producer, type, data);
      const mark = produced.length;
      await feed(producer, update[0], update[1]);

      const [payload, shardId, state] = dispatched.at(-1)!;
      const serialized = producer.serializeDispatchState(payload.t, state);
      // The worker only ever sees what went through the wire.
      const wire = serialized === undefined ? undefined : JSON.parse(JSON.stringify(serialized));
      expect(wire).toBeDefined();

      const revived = await worker.reviveDispatchState(payload.t, wire, payload.d);
      await worker.replayDispatch(payload, shardId, revived);

      const expected = visible(produced.slice(mark));
      expect(expected.length).toBeGreaterThan(0);
      expect(plain(visible(replayed))).toEqual(plain(expected));
    },
  );

  test("GIVEN an update of an uncached message THEN no state is shipped and the worker matches the producer", async () => {
    const { producer, worker } = createPair();
    const produced = recordAll(producer);
    const replayed = recordAll(worker);
    const dispatched = captureDispatches(producer);

    await feed(producer, GatewayDispatchEvents.MessageUpdate, message({ content: "edited" }));

    const [payload, shardId, state] = dispatched.at(-1)!;
    expect(state).toBeUndefined();
    expect(producer.serializeDispatchState(payload.t, state)).toBeUndefined();

    const revived = await worker.reviveDispatchState(payload.t, undefined, payload.d);
    expect(revived).toBeUndefined();
    await worker.replayDispatch(payload, shardId, revived);

    expect(plain(visible(replayed))).toEqual(plain(visible(produced)));
  });

  test("GIVEN a type without a codec THEN serializing and reviving are no-ops", async () => {
    const { producer } = createPair();
    expect(producer.serializeDispatchState("TYPING_START", { a: 1 })).toBeUndefined();
    expect(await producer.reviveDispatchState("TYPING_START", { a: 1 }, {})).toBeUndefined();
  });
});

describe("replayDispatch", () => {
  test("GIVEN a replay THEN raw is emitted, the cache is not written, and dispatch is not emitted", async () => {
    const { producer, worker } = createPair();
    const calls = recordAll(worker);

    await worker.replayDispatch({ t: GatewayDispatchEvents.MessageCreate, d: message() }, 0);

    expect(calls.map(([event]) => event)).toEqual(["raw", "messageCreate"]);
    expect(await producer.messages.get(channelId, message().id)).toBeUndefined();
  });

  test("GIVEN INTERACTION_CREATE or READY THEN only raw is emitted", async () => {
    const { worker } = createPair();
    const calls = recordAll(worker);

    await worker.replayDispatch({ t: GatewayDispatchEvents.InteractionCreate, d: {} }, 0);
    await worker.replayDispatch({ t: GatewayDispatchEvents.Ready, d: {} }, 0);

    expect(calls.map(([event]) => event)).toEqual(["raw", "raw"]);
  });

  test("GIVEN a dispatch type with no action THEN it resolves", async () => {
    const { worker } = createPair();
    await expect(worker.replayDispatch({ t: "SOMETHING_NEW", d: {} }, 0)).resolves.toBeUndefined();
  });

  test("GIVEN a throwing listener THEN the replay rejects with its error", async () => {
    const { worker } = createPair();
    worker.on("messageCreate", () => {
      throw new Error("boom");
    });

    await expect(
      worker.replayDispatch({ t: GatewayDispatchEvents.MessageCreate, d: message() }, 0),
    ).rejects.toThrow("boom");

    // The queue still runs the next replay of the guild.
    const other = vi.fn();
    worker.removeAllListeners("messageCreate");
    worker.on("messageCreate", other);
    await worker.replayDispatch(
      { t: GatewayDispatchEvents.MessageCreate, d: message({ id: "2" }) },
      0,
    );
    expect(other).toHaveBeenCalledOnce();
  });

  test("GIVEN an async listener that rejects THEN the replay rejects with its error", async () => {
    const { worker } = createPair();
    worker.on("messageCreate", async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      throw new Error("async boom");
    });

    await expect(
      worker.replayDispatch({ t: GatewayDispatchEvents.MessageCreate, d: message() }, 0),
    ).rejects.toThrow("async boom");
  });

  test("GIVEN an async listener THEN the replay resolves only once it finished", async () => {
    const { worker } = createPair();
    let finished = false;
    worker.on("raw", async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    worker.on("messageCreate", async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      finished = true;
    });

    await worker.replayDispatch({ t: GatewayDispatchEvents.MessageCreate, d: message() }, 0);

    expect(finished).toBe(true);
  });

  test("GIVEN a once listener THEN a replay runs it a single time", async () => {
    const { worker } = createPair();
    const listener = vi.fn();
    worker.once("messageCreate", listener);

    await worker.replayDispatch({ t: GatewayDispatchEvents.MessageCreate, d: message() }, 0);
    await worker.replayDispatch(
      { t: GatewayDispatchEvents.MessageCreate, d: message({ id: "2" }) },
      0,
    );

    expect(listener).toHaveBeenCalledOnce();
  });

  test("GIVEN replays of one guild THEN they run in the order they were called", async () => {
    const { worker } = createPair();
    const order: string[] = [];
    // Listeners are not awaited, so the slow step has to be part of handling the dispatch itself.
    const hydrate = worker.messages.hydrate.bind(worker.messages);
    vi.spyOn(worker.messages, "hydrate").mockImplementation(async (data) => {
      if (data.id === "1") await new Promise((resolve) => setTimeout(resolve, 20));
      return hydrate(data);
    });
    worker.on("messageCreate", (created) => void order.push(created.id));

    await Promise.all([
      worker.replayDispatch({ t: GatewayDispatchEvents.MessageCreate, d: message({ id: "1" }) }, 0),
      worker.replayDispatch({ t: GatewayDispatchEvents.MessageCreate, d: message({ id: "2" }) }, 0),
    ]);

    expect(order).toEqual(["1", "2"]);
  });

  test("GIVEN a worker THEN its replayable types are the handled ones, without READY", () => {
    const { worker } = createPair();
    expect(worker.replayDispatchTypes).toContain(GatewayDispatchEvents.MessageUpdate);
    expect(worker.replayDispatchTypes).not.toContain(GatewayDispatchEvents.Ready);
    expect(worker.replayDispatchTypes).not.toContain(GatewayDispatchEvents.InteractionCreate);
  });
});
