import {
  ChannelType,
  GatewayDispatchEvents,
  GatewayOpcodes,
  type APIMessage,
  type APIUser,
  type GatewayDispatchPayload,
} from "discord-api-types/v10";
import { describe, expect, test } from "vitest";
import {
  applyCacheOperations,
  applyGatewayDispatch,
  createCache,
  createCacheOperations,
  createInMemoryCache,
  MemoryEntityCache,
  type EntityCache,
  memberKey,
  messageKey,
  roleKey,
  threadMemberKey,
} from "../src/index.js";
import { addReaction } from "../src/lib/reactions.js";

const user: APIUser = {
  id: "1",
  username: "wolf",
  discriminator: "0",
  global_name: null,
  avatar: null,
};

function dispatch(t: GatewayDispatchEvents, d: unknown): GatewayDispatchPayload {
  return { op: GatewayOpcodes.Dispatch, s: 1, t, d } as GatewayDispatchPayload;
}

function message(id: string, channelId: string, content = "hello") {
  return {
    id,
    channel_id: channelId,
    guild_id: "10",
    author: user,
    member: {
      roles: [],
      joined_at: "2024-01-01T00:00:00.000Z",
      deaf: false,
      mute: false,
      flags: 0,
    },
    content,
    mentions: [],
    mention_roles: [],
  };
}

function guild(id: string) {
  return {
    id,
    name: "Pack",
    roles: [{ id: "100", name: "@everyone" }],
    emojis: [],
    stickers: [],
    channels: [{ id: "20", type: ChannelType.GuildText, name: "general" }],
    threads: [],
    members: [{ user, roles: [], joined_at: "2024-01-01T00:00:00.000Z" }],
    presences: [],
    voice_states: [],
    stage_instances: [],
    guild_scheduled_events: [],
    soundboard_sounds: [],
  };
}

describe("createCacheOperations", () => {
  test("GIVEN an INTERACTION_CREATE THEN nothing is cached", () => {
    expect(createCacheOperations(dispatch(GatewayDispatchEvents.InteractionCreate, {}))).toEqual(
      [],
    );
  });

  test("GIVEN a MESSAGE_CREATE THEN the message, its author, and its member are upserted", () => {
    const operations = createCacheOperations(
      dispatch(GatewayDispatchEvents.MessageCreate, message("30", "20")),
    );

    expect(operations.map(({ type, store }) => `${type}:${store}`)).toEqual([
      "upsert:messages",
      "upsert:users",
      "upsert:members",
    ]);
  });
});

describe("applyGatewayDispatch", () => {
  test("GIVEN a GUILD_UPDATE THEN its roles go to the roles cache, not the guild entry", async () => {
    const cache = createInMemoryCache();
    await applyGatewayDispatch(cache, dispatch(GatewayDispatchEvents.GuildCreate, guild("10")));
    const {
      channels: _channels,
      members: _members,
      ...update
    } = guild("10") as Record<string, unknown>;
    const roles = [{ ...(update.roles as object[])[0]!, name: "Alpha" }];

    await applyGatewayDispatch(
      cache,
      dispatch(GatewayDispatchEvents.GuildUpdate, { ...update, name: "Den", roles }),
    );

    expect(cache.guilds.get("10")).toMatchObject({ name: "Den" });
    expect(cache.guilds.get("10")).not.toHaveProperty("roles");
    expect(cache.roles.get(roleKey("10", "100"))).toMatchObject({ name: "Alpha", guild_id: "10" });
  });

  test("GIVEN threads created and synced THEN they and their members carry the guild ID", async () => {
    const cache = createInMemoryCache();
    const thread = { id: "30", type: 11, guild_id: "10", parent_id: "20", name: "den" };

    await applyGatewayDispatch(
      cache,
      dispatch(GatewayDispatchEvents.ThreadCreate, {
        ...thread,
        newly_created: true,
        member: { id: "30", user_id: "1", join_timestamp: "2026-01-01T00:00:00.000Z", flags: 0 },
      }),
    );
    await applyGatewayDispatch(
      cache,
      dispatch(GatewayDispatchEvents.ThreadListSync, {
        guild_id: "10",
        threads: [{ id: "31", type: 11, parent_id: "20", name: "lair" }],
        members: [],
      }),
    );

    expect(cache.threadMembers.get(threadMemberKey("30", "1"))).toMatchObject({ guild_id: "10" });
    expect(cache.threads.get("31")).toMatchObject({ guild_id: "10" });
  });

  test("GIVEN a GUILD_CREATE THEN its collections are split into their own entity caches", async () => {
    const cache = createInMemoryCache();

    await applyGatewayDispatch(cache, dispatch(GatewayDispatchEvents.GuildCreate, guild("10")));

    const stored = cache.guilds.get("10")!;
    expect(stored.name).toBe("Pack");
    expect(stored).not.toHaveProperty("channels");
    expect(stored).not.toHaveProperty("members");
    expect(stored).not.toHaveProperty("roles");
    expect(stored).not.toHaveProperty("emojis");
    expect(stored).not.toHaveProperty("stickers");
    expect(cache.channels.get("20")).toMatchObject({ name: "general", guild_id: "10" });
    expect(cache.members.get(memberKey("10", "1"))).toMatchObject({ guild_id: "10" });
    expect(cache.roles.get(roleKey("10", "100"))).toMatchObject({
      name: "@everyone",
      guild_id: "10",
    });
    expect(cache.users.get("1")).toEqual(user);
  });

  test("GIVEN an update THEN it is merged into the cached entry", async () => {
    const cache = createInMemoryCache();

    await applyGatewayDispatch(cache, dispatch(GatewayDispatchEvents.GuildCreate, guild("10")));
    await applyGatewayDispatch(
      cache,
      dispatch(GatewayDispatchEvents.GuildMemberUpdate, {
        guild_id: "10",
        user,
        roles: ["100"],
        nick: "alpha",
      }),
    );

    expect(cache.members.get(memberKey("10", "1"))).toMatchObject({
      nick: "alpha",
      roles: ["100"],
      joined_at: "2024-01-01T00:00:00.000Z",
    });
  });

  test("GIVEN a CHANNEL_DELETE THEN the channel's messages are dropped", async () => {
    const cache = createInMemoryCache();

    await applyGatewayDispatch(
      cache,
      dispatch(GatewayDispatchEvents.MessageCreate, message("30", "20")),
    );
    await applyGatewayDispatch(
      cache,
      dispatch(GatewayDispatchEvents.MessageCreate, message("31", "21")),
    );
    await applyGatewayDispatch(
      cache,
      dispatch(GatewayDispatchEvents.ChannelDelete, { id: "20", type: ChannelType.GuildText }),
    );

    expect(cache.messages.has(messageKey("20", "30"))).toBe(false);
    expect(cache.messages.has(messageKey("21", "31"))).toBe(true);
  });

  test("GIVEN a GUILD_DELETE THEN every guild-scoped entity is dropped", async () => {
    const cache = createInMemoryCache();

    await applyGatewayDispatch(cache, dispatch(GatewayDispatchEvents.GuildCreate, guild("10")));
    await applyGatewayDispatch(cache, dispatch(GatewayDispatchEvents.GuildCreate, guild("11")));
    await applyGatewayDispatch(cache, dispatch(GatewayDispatchEvents.GuildDelete, { id: "10" }));

    expect(cache.guilds.has("10")).toBe(false);
    expect(cache.members.has(memberKey("10", "1"))).toBe(false);
    expect(cache.roles.has(roleKey("10", "100"))).toBe(false);
    expect(cache.guilds.has("11")).toBe(true);
    expect(cache.members.has(memberKey("11", "1"))).toBe(true);
    // Users are global, they outlive the guilds they were seen in.
    expect(cache.users.has("1")).toBe(true);
  });

  test("GIVEN an unavailable GUILD_DELETE THEN the guild data is kept", async () => {
    const cache = createInMemoryCache();

    await applyGatewayDispatch(cache, dispatch(GatewayDispatchEvents.GuildCreate, guild("10")));
    await applyGatewayDispatch(
      cache,
      dispatch(GatewayDispatchEvents.GuildDelete, { id: "10", unavailable: true }),
    );

    expect(cache.guilds.get("10")).toMatchObject({ name: "Pack", unavailable: true });
    expect(cache.members.has(memberKey("10", "1"))).toBe(true);
  });

  test("GIVEN a MESSAGE_DELETE_BULK THEN every listed message is dropped", async () => {
    const cache = createInMemoryCache();

    await applyGatewayDispatch(
      cache,
      dispatch(GatewayDispatchEvents.MessageCreate, message("30", "20")),
    );
    await applyGatewayDispatch(
      cache,
      dispatch(GatewayDispatchEvents.MessageCreate, message("31", "20")),
    );
    await applyGatewayDispatch(
      cache,
      dispatch(GatewayDispatchEvents.MessageDeleteBulk, { ids: ["30", "31"], channel_id: "20" }),
    );

    expect(cache.messages.getSize()).toBe(0);
  });
});

describe("scheduled events", () => {
  test("GIVEN a GUILD_SCHEDULED_EVENT_CREATE THEN its creator is cached", async () => {
    const cache = createInMemoryCache();

    await applyGatewayDispatch(
      cache,
      dispatch(GatewayDispatchEvents.GuildScheduledEventCreate, {
        id: "40",
        guild_id: "10",
        name: "Full moon",
        creator: user,
      }),
    );

    expect(await cache.users.get(user.id)).toEqual(user);
  });
});

describe("reactions and poll votes", () => {
  const key = messageKey("20", "30");
  const wolf = { id: null, name: "🐺" };

  async function cacheWithMessage(extra: Record<string, unknown> = {}) {
    const cache = createInMemoryCache();
    await applyGatewayDispatch(
      cache,
      dispatch(GatewayDispatchEvents.MessageCreate, { ...message("30", "20"), ...extra }),
    );
    return cache;
  }

  function reaction(t: GatewayDispatchEvents, userId: string, extra: Record<string, unknown> = {}) {
    return dispatch(t, {
      user_id: userId,
      channel_id: "20",
      message_id: "30",
      emoji: wolf,
      burst: false,
      type: 0,
      ...extra,
    });
  }

  test("GIVEN reactions added and removed THEN the counts and me flag follow", async () => {
    const cache = await cacheWithMessage();
    const context = { clientUserId: "99" };

    await applyGatewayDispatch(
      cache,
      reaction(GatewayDispatchEvents.MessageReactionAdd, "99"),
      context,
    );
    await applyGatewayDispatch(
      cache,
      reaction(GatewayDispatchEvents.MessageReactionAdd, "5"),
      context,
    );
    expect((await cache.messages.get(key))?.reactions).toEqual([
      {
        emoji: wolf,
        count: 2,
        count_details: { normal: 2, burst: 0 },
        me: true,
        me_burst: false,
        burst_colors: [],
      },
    ]);

    await applyGatewayDispatch(
      cache,
      reaction(GatewayDispatchEvents.MessageReactionRemove, "99"),
      context,
    );
    expect((await cache.messages.get(key))?.reactions?.[0]).toMatchObject({ count: 1, me: false });

    await applyGatewayDispatch(
      cache,
      reaction(GatewayDispatchEvents.MessageReactionRemove, "5"),
      context,
    );
    expect((await cache.messages.get(key))?.reactions).toEqual([]);
  });

  test("GIVEN a REMOVE_EMOJI or REMOVE_ALL THEN the reactions are dropped", async () => {
    const cache = await cacheWithMessage();
    await applyGatewayDispatch(cache, reaction(GatewayDispatchEvents.MessageReactionAdd, "5"));
    await applyGatewayDispatch(
      cache,
      reaction(GatewayDispatchEvents.MessageReactionAdd, "5", { emoji: { id: "7", name: "howl" } }),
    );

    await applyGatewayDispatch(
      cache,
      dispatch(GatewayDispatchEvents.MessageReactionRemoveEmoji, {
        channel_id: "20",
        message_id: "30",
        emoji: wolf,
      }),
    );
    expect((await cache.messages.get(key))?.reactions?.map((r) => r.emoji.id)).toEqual(["7"]);

    await applyGatewayDispatch(
      cache,
      dispatch(GatewayDispatchEvents.MessageReactionRemoveAll, {
        channel_id: "20",
        message_id: "30",
      }),
    );
    expect((await cache.messages.get(key))?.reactions).toEqual([]);
  });

  test("GIVEN a reaction on an uncached message THEN nothing is written", async () => {
    const cache = createInMemoryCache();

    await applyGatewayDispatch(cache, reaction(GatewayDispatchEvents.MessageReactionAdd, "5"));

    expect(await cache.messages.get(key)).toBeUndefined();
  });

  test("GIVEN poll votes THEN the answer counts follow", async () => {
    const cache = await cacheWithMessage({
      poll: {
        question: { text: "Best pack?" },
        answers: [{ answer_id: 1, poll_media: { text: "Ours" } }],
        expiry: null,
        allow_multiselect: false,
        layout_type: 1,
      },
    });
    const vote = (t: GatewayDispatchEvents, userId: string) =>
      dispatch(t, { user_id: userId, channel_id: "20", message_id: "30", answer_id: 1 });

    await applyGatewayDispatch(cache, vote(GatewayDispatchEvents.MessagePollVoteAdd, "99"), {
      clientUserId: "99",
    });
    await applyGatewayDispatch(cache, vote(GatewayDispatchEvents.MessagePollVoteAdd, "5"));
    expect((await cache.messages.get(key))?.poll?.results?.answer_counts).toEqual([
      { id: 1, count: 2, me_voted: true },
    ]);

    await applyGatewayDispatch(cache, vote(GatewayDispatchEvents.MessagePollVoteRemove, "99"), {
      clientUserId: "99",
    });
    expect((await cache.messages.get(key))?.poll?.results?.answer_counts).toEqual([
      { id: 1, count: 1, me_voted: false },
    ]);
  });
});

describe("partial caches", () => {
  const guildPayload = {
    id: "10",
    name: "Pack",
    channels: [{ id: "20", type: ChannelType.GuildText, name: "general" }],
    members: [
      {
        user,
        roles: [],
        joined_at: "2024-01-01T00:00:00.000Z",
        deaf: false,
        mute: false,
        flags: 0,
      },
    ],
    roles: [{ id: "10", name: "@everyone" }],
    emojis: [],
    stickers: [],
  };

  test("GIVEN a cache holding only guilds THEN a GUILD_CREATE writes only the guild", async () => {
    const guilds = new MemoryEntityCache();
    const cache = createCache({ makeCache: (entity) => (entity === "guilds" ? guilds : null) });

    await applyGatewayDispatch(cache, dispatch(GatewayDispatchEvents.GuildCreate, guildPayload));

    expect(guilds.keys()).toEqual(["10"]);
  });

  test("GIVEN an empty cache THEN every dispatch is a no-op", async () => {
    const cache = createCache({ makeCache: () => null });

    await expect(
      applyGatewayDispatch(cache, dispatch(GatewayDispatchEvents.GuildCreate, guild)),
    ).resolves.toEqual([]);
    await expect(
      applyGatewayDispatch(cache, dispatch(GatewayDispatchEvents.GuildDelete, { id: "10" })),
    ).resolves.toEqual([]);
  });

  test("GIVEN a store that cannot enumerate THEN GUILD_DELETE skips its scan", async () => {
    const inner = new MemoryEntityCache<any>();
    inner.set("20", { id: "20", guild_id: "10" });
    // Only the base contract: no keys, values, entries, nor deleteGuild.
    const channels: EntityCache<any> = {
      get: (key) => inner.get(key),
      set: (key, value, options) => inner.set(key, value, options),
      upsert: (key, data, options) => inner.upsert(key, data, options),
      has: (key) => inner.has(key),
      delete: (key) => inner.delete(key),
      clear: () => inner.clear(),
      getSize: () => inner.getSize(),
    };
    const cache = createCache({ makeCache: (entity) => (entity === "channels" ? channels : null) });

    await applyGatewayDispatch(cache, dispatch(GatewayDispatchEvents.GuildDelete, { id: "10" }));

    expect(inner.has("20")).toBe(true);
  });
});

describe("applyCacheOperations results", () => {
  test("GIVEN upserts THEN each result carries the entry before and after", async () => {
    const cache = createInMemoryCache({ entities: ["users"] });
    cache.users!.set("1", user);

    const results = await applyCacheOperations(cache, [
      { type: "upsert", store: "users", key: "1", raw: { id: "1", username: "new" }, merge: true },
      { type: "upsert", store: "users", key: "2", raw: { ...user, id: "2" } },
      { type: "upsert", store: "members", key: "10:1", raw: {} },
    ]);

    expect(results).toEqual([
      {
        entity: "users",
        key: "1",
        type: "upsert",
        existing: user,
        added: { ...user, username: "new" },
      },
      {
        entity: "users",
        key: "2",
        type: "upsert",
        existing: undefined,
        added: { ...user, id: "2" },
      },
    ]);
  });

  test("GIVEN a non-merged upsert THEN the cached entry is replaced", async () => {
    const cache = createInMemoryCache({ entities: ["users"] });
    cache.users!.set("1", { ...user, bot: true });

    await applyCacheOperations(cache, [{ type: "upsert", store: "users", key: "1", raw: user }]);

    expect(cache.users!.get("1")).toEqual(user);
  });

  test("GIVEN updates and deletes THEN their results carry the previous entry", async () => {
    const cache = createInMemoryCache({ entities: ["users"] });
    cache.users!.set("1", user);
    cache.users!.set("2", { ...user, id: "2" });

    const results = await applyCacheOperations(cache, [
      {
        type: "update",
        store: "users",
        key: "1",
        update: (value) => ({ ...(value as object), username: "u" }),
      },
      { type: "update", store: "users", key: "3", update: (value) => value },
      { type: "delete", store: "users", key: "2" },
      { type: "deleteWhere", store: "users", predicate: () => true },
    ]);

    expect(results).toEqual([
      {
        entity: "users",
        key: "1",
        type: "update",
        existing: user,
        added: { ...user, username: "u" },
      },
      { entity: "users", key: "2", type: "delete", existing: { ...user, id: "2" } },
      { entity: "users", key: "1", type: "delete", existing: { ...user, username: "u" } },
    ]);
  });
});

describe("addReaction", () => {
  const bot = "266624760782258186";
  const emoji = { id: null, name: "🐺" };
  const base = { id: "30", channel_id: "20" } as APIMessage;
  const event = (userId: string, burst = false) =>
    ({ user_id: userId, channel_id: "20", message_id: "30", emoji, burst, type: 0 }) as never;

  test("GIVEN the bot's own reaction already counted THEN the message is returned unchanged", () => {
    const message = {
      ...base,
      reactions: [
        {
          emoji,
          count: 1,
          count_details: { normal: 1, burst: 0 },
          me: true,
          me_burst: false,
          burst_colors: [],
        },
      ],
    } as APIMessage;

    expect(addReaction(message, event(bot), bot)).toBe(message);
  });

  test("GIVEN someone else's reaction on an emoji the bot reacted with THEN it is counted", () => {
    const message = addReaction(addReaction(base, event(bot), bot), event("1"), bot);

    expect(message.reactions?.[0]).toMatchObject({ count: 2, me: true });
  });

  test("GIVEN the bot's burst reaction on an emoji it reacted normally with THEN it is counted", () => {
    const message = addReaction(addReaction(base, event(bot), bot), event(bot, true), bot);

    expect(message.reactions?.[0]).toMatchObject({
      count: 2,
      count_details: { normal: 1, burst: 1 },
      me: true,
      me_burst: true,
    });
  });
});
