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
import { ClientUser } from "../src/structures/users/ClientUser.js";

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
  // A collection of structures, e.g. the reactions of `messageReactionRemoveAll`.
  if (value instanceof Map) return [...value].map(plain);
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
  /** Prepares the producer before anything is fed to it. */
  setup?: (producer: GatewayClient) => void;
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

const guild = (extra: object = {}) => ({
  id: guildId,
  name: "Pack",
  icon: null,
  owner_id: author.id,
  features: [],
  ...extra,
});
const thread = (extra: object = {}) => ({
  id: threadId,
  type: ChannelType.PublicThread,
  guild_id: guildId,
  parent_id: channelId,
  name: "thread",
  ...extra,
});
const voiceState = (extra: object = {}) => ({
  guild_id: guildId,
  channel_id: channelId,
  user_id: author.id,
  session_id: "session",
  deaf: false,
  mute: false,
  self_deaf: false,
  self_mute: true,
  self_video: false,
  suppress: false,
  request_to_speak_timestamp: null,
  ...extra,
});
const presence = (extra: object = {}) => ({
  guild_id: guildId,
  user: { id: author.id },
  status: "online",
  activities: [],
  client_status: { desktop: "online" },
  ...extra,
});
const invite = (extra: object = {}) => ({
  code: "wolves",
  guild_id: guildId,
  channel_id: channelId,
  created_at: "2024-01-01T00:00:00.000Z",
  max_age: 0,
  max_uses: 0,
  temporary: false,
  uses: 0,
  expires_at: null,
  ...extra,
});
const scheduledEvent = (extra: object = {}) => ({
  id: "300000000000000031",
  guild_id: guildId,
  channel_id: null,
  creator_id: author.id,
  creator: author,
  name: "Full moon",
  description: null,
  scheduled_start_time: "2026-10-01T20:00:00.000Z",
  scheduled_end_time: "2026-10-01T22:00:00.000Z",
  privacy_level: 2,
  status: 1,
  entity_type: 3,
  entity_id: null,
  entity_metadata: { location: "The den" },
  recurrence_rule: null,
  ...extra,
});
const autoModerationRule = (extra: object = {}) => ({
  id: "900000000000000090",
  guild_id: guildId,
  name: "No howling",
  creator_id: author.id,
  event_type: 1,
  trigger_type: 1,
  trigger_metadata: { keyword_filter: ["awoo"], allow_list: ["wolf"] },
  actions: [{ type: 1 }],
  enabled: true,
  exempt_roles: [],
  exempt_channels: [],
  ...extra,
});
const integration = (extra: object = {}) => ({
  id: "400000000000000041",
  guild_id: guildId,
  name: "Twitch",
  type: "twitch",
  enabled: true,
  account: { id: "wolfstream", name: "wolfstream" },
  user: author,
  ...extra,
});
const sticker = (extra: object = {}) => ({
  id: "450000000000000045",
  name: "sticker",
  description: null,
  tags: "wolf",
  type: 2,
  format_type: 1,
  ...extra,
});

const botUser: APIUser = { ...author, id: "266624760782258186", username: "bot" };

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
    name: "the bot's own user",
    setup: (producer) => void (producer.user = new ClientUser(botUser)),
    seed: [[GatewayDispatchEvents.MessageCreate, message({ author: botUser })]],
    update: [GatewayDispatchEvents.UserUpdate, { ...botUser, username: "renamed" }],
  },
  {
    name: "empty reaction collection (message without reactions)",
    seed: [[GatewayDispatchEvents.MessageCreate, message()]],
    update: [
      GatewayDispatchEvents.MessageReactionRemoveAll,
      { channel_id: channelId, message_id: message().id, guild_id: guildId },
    ],
  },
  {
    name: "single, root manager (guild update)",
    seed: [[GatewayDispatchEvents.GuildCreate, guild()]],
    update: [GatewayDispatchEvents.GuildUpdate, guild({ name: "Renamed" })],
  },
  {
    name: "single, root manager (guild delete)",
    seed: [[GatewayDispatchEvents.GuildCreate, guild()]],
    update: [GatewayDispatchEvents.GuildDelete, { id: guildId }],
  },
  {
    name: "single, root manager (thread update)",
    seed: [[GatewayDispatchEvents.ThreadCreate, thread()]],
    update: [GatewayDispatchEvents.ThreadUpdate, thread({ name: "renamed" })],
  },
  {
    name: "single, root manager (thread delete)",
    seed: [[GatewayDispatchEvents.ThreadCreate, thread()]],
    update: [
      GatewayDispatchEvents.ThreadDelete,
      { id: threadId, guild_id: guildId, parent_id: channelId, type: ChannelType.PublicThread },
    ],
  },
  {
    name: "single, root manager (thread member update)",
    seed: [[GatewayDispatchEvents.ThreadMemberUpdate, { ...threadMember, guild_id: guildId }]],
    update: [
      GatewayDispatchEvents.ThreadMemberUpdate,
      { ...threadMember, flags: 2, guild_id: guildId },
    ],
  },
  {
    name: "single, root manager (message delete)",
    seed: [[GatewayDispatchEvents.MessageCreate, message()]],
    update: [
      GatewayDispatchEvents.MessageDelete,
      { id: message().id, channel_id: channelId, guild_id: guildId },
    ],
  },
  {
    name: "single, root manager (member remove)",
    seed: [[GatewayDispatchEvents.GuildMemberAdd, member()]],
    update: [GatewayDispatchEvents.GuildMemberRemove, { guild_id: guildId, user: author }],
  },
  {
    name: "single, root manager (role delete)",
    seed: [[GatewayDispatchEvents.GuildRoleCreate, { guild_id: guildId, role: role() }]],
    update: [GatewayDispatchEvents.GuildRoleDelete, { guild_id: guildId, role_id: role().id }],
  },
  {
    name: "single, root manager (voice state)",
    seed: [[GatewayDispatchEvents.VoiceStateUpdate, voiceState()]],
    update: [GatewayDispatchEvents.VoiceStateUpdate, voiceState({ self_mute: false })],
  },
  {
    name: "single, root manager (presence)",
    seed: [[GatewayDispatchEvents.PresenceUpdate, presence()]],
    update: [GatewayDispatchEvents.PresenceUpdate, presence({ status: "idle" })],
  },
  {
    name: "single, guild-scoped manager (invite delete)",
    seed: [[GatewayDispatchEvents.InviteCreate, invite()]],
    update: [
      GatewayDispatchEvents.InviteDelete,
      { code: invite().code, guild_id: guildId, channel_id: channelId },
    ],
  },
  {
    name: "single, guild-scoped manager (scheduled event update)",
    seed: [[GatewayDispatchEvents.GuildScheduledEventCreate, scheduledEvent()]],
    update: [GatewayDispatchEvents.GuildScheduledEventUpdate, scheduledEvent({ name: "New moon" })],
  },
  {
    name: "single, guild-scoped manager (soundboard sound delete)",
    seed: [[GatewayDispatchEvents.GuildSoundboardSoundCreate, sound()]],
    update: [
      GatewayDispatchEvents.GuildSoundboardSoundDelete,
      { sound_id: sound().sound_id, guild_id: guildId },
    ],
  },
  {
    name: "single, guild-scoped manager (ban remove)",
    seed: [[GatewayDispatchEvents.GuildBanAdd, { guild_id: guildId, user: author }]],
    update: [GatewayDispatchEvents.GuildBanRemove, { guild_id: guildId, user: author }],
  },
  {
    name: "single, guild-scoped manager (auto moderation rule update)",
    seed: [[GatewayDispatchEvents.AutoModerationRuleCreate, autoModerationRule()]],
    update: [
      GatewayDispatchEvents.AutoModerationRuleUpdate,
      autoModerationRule({ name: "No growling" }),
    ],
  },
  {
    name: "single, guild-scoped manager (integration update)",
    seed: [[GatewayDispatchEvents.IntegrationCreate, integration()]],
    update: [GatewayDispatchEvents.IntegrationUpdate, integration({ name: "YouTube" })],
  },
  {
    name: "single, guild-scoped manager (integration delete)",
    seed: [[GatewayDispatchEvents.IntegrationCreate, integration()]],
    update: [GatewayDispatchEvents.IntegrationDelete, { id: integration().id, guild_id: guildId }],
  },
  {
    name: "list, guild-scoped manager (stickers)",
    seed: [
      [GatewayDispatchEvents.GuildStickersUpdate, { guild_id: guildId, stickers: [sticker()] }],
    ],
    update: [GatewayDispatchEvents.GuildStickersUpdate, { guild_id: guildId, stickers: [] }],
  },
];

describe("state round trip", () => {
  test.each(cases)(
    "GIVEN $name THEN the worker emits what the producer did",
    async ({ seed, update, setup }) => {
      const { producer, worker } = createPair();
      setup?.(producer);
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
    expect(
      await producer.messages.cache.get(producer.messages.resolveKey(channelId, message().id)),
    ).toBeUndefined();
  });

  test("GIVEN a replay THEN raw gets a full gateway payload, with the sequence number when known", async () => {
    const { worker } = createPair();
    const raws: unknown[] = [];
    worker.on("raw", (payload) => raws.push(payload));
    const d = message();

    await worker.replayDispatch({ t: GatewayDispatchEvents.MessageCreate, d, s: 5 }, 0);
    await worker.replayDispatch({ t: GatewayDispatchEvents.MessageCreate, d }, 0);

    expect(raws).toEqual([
      { op: GatewayOpcodes.Dispatch, s: 5, t: GatewayDispatchEvents.MessageCreate, d },
      { op: GatewayOpcodes.Dispatch, s: 0, t: GatewayDispatchEvents.MessageCreate, d },
    ]);
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
    const build = worker.messages._build.bind(worker.messages);
    vi.spyOn(worker.messages, "_build").mockImplementation(async (data, extras) => {
      if (data.id === "1") await new Promise((resolve) => setTimeout(resolve, 20));
      return build(data, extras);
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
