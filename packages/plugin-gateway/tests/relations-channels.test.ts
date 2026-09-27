import { WebSocketShardEvents } from "@discordjs/ws";
import {
  createInMemoryCache,
  memberKey,
  stageInstanceKey,
  threadMemberKey,
  voiceStateKey,
} from "@wolfstar/plugin-cache";
import {
  ChannelType,
  GatewayDispatchEvents,
  GatewayOpcodes,
  StageInstancePrivacyLevel,
  type GatewayDispatchPayload,
} from "discord-api-types/v10";
import { describe, expect, test } from "vitest";
import {
  GatewayClient,
  kPatch,
  type DMChannel,
  type GatewayEventMap,
  type Guild,
  type PublicThreadChannel,
  type StageChannel,
  type TextChannel,
} from "../src/index.js";

const guildId = "100000000000000010";
const categoryId = "200000000000000010";
const channelId = "200000000000000020";
const threadId = "200000000000000030";
const stageId = "200000000000000040";
const dmId = "200000000000000050";
const botId = "266624760782258186";
const userId = "600000000000000600";
const user = { id: userId, username: "wolf", discriminator: "0", global_name: null, avatar: null };
const member = { user, roles: [], joined_at: "2026-01-01T00:00:00.000Z", deaf: false, mute: false };

function createClient(cache = true) {
  return new GatewayClient({
    discordPublicKey: "0".repeat(64),
    discordToken: "test-token",
    clientId: botId,
    intents: 0,
    cache: cache ? createInMemoryCache() : undefined,
  });
}

async function dispatch(client: GatewayClient, t: GatewayDispatchEvents, d: unknown) {
  const payload = { op: GatewayOpcodes.Dispatch, s: 1, t, d } as GatewayDispatchPayload;
  client.gateway.emit(WebSocketShardEvents.Dispatch, payload, 0);
  await client.idle();
}

const guild = { id: guildId, name: "Pack", features: [], icon: null };
const category = {
  id: categoryId,
  type: ChannelType.GuildCategory,
  name: "den",
  guild_id: guildId,
};
const text = {
  id: channelId,
  type: ChannelType.GuildText,
  name: "general",
  guild_id: guildId,
  parent_id: categoryId,
};
const thread = {
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
};
const stage = { id: stageId, type: ChannelType.GuildStageVoice, name: "stage", guild_id: guildId };
const dm = { id: dmId, type: ChannelType.DM, recipients: [{ ...user, username: "stale" }] };

async function seed(client: GatewayClient) {
  const cache = client.cache!;
  await cache.guilds.set(guildId, guild as never);
  await cache.channels.set(categoryId, category as never);
  await cache.channels.set(channelId, text as never);
  await cache.channels.set(stageId, stage as never);
  await cache.channels.set(dmId, dm as never);
  await cache.threads.set(threadId, thread as never);
  await cache.users.set(userId, user as never);
}

describe("channel relations", () => {
  test("GIVEN a cached category THEN channel.parent resolves it, with the guild", async () => {
    const client = createClient();
    await seed(client);

    const channel = (await client.channels.get(channelId)) as TextChannel;

    expect(channel.parent?.id).toBe(categoryId);
    expect(channel.parent?.guild?.id).toBe(guildId);
    expect(client.channels.cached(channelId)?.id).toBe(channelId);
  });

  test("GIVEN an uncached parent THEN channel.parent is null", async () => {
    const client = createClient();
    await client.cache!.channels.set(channelId, text as never);

    const channel = (await client.channels.get(channelId)) as TextChannel;

    expect(channel.parentId).toBe(categoryId);
    expect(channel.parent).toBeNull();
  });

  test("GIVEN a patch moving the channel THEN the stale parent is dropped", async () => {
    const client = createClient();
    await seed(client);
    const channel = (await client.channels.get(channelId)) as TextChannel;

    channel[kPatch]({ topic: "howl" } as never);
    expect(channel.parent?.id).toBe(categoryId);
    channel[kPatch]({ parent_id: null } as never);
    expect(channel.parent).toBeNull();
  });

  test("GIVEN a thread THEN its parent chain resolves up to the category", async () => {
    const client = createClient();
    await seed(client);

    const resolved = (await client.channels.get(threadId)) as PublicThreadChannel;

    expect(resolved.parent?.id).toBe(channelId);
    expect((resolved.parent as TextChannel).parent?.id).toBe(categoryId);
  });

  test("GIVEN the bot's thread member THEN thread.joined is true, false otherwise", async () => {
    const client = createClient();
    await seed(client);
    expect(((await client.threads.get(threadId)) as PublicThreadChannel).joined).toBe(false);

    await client.cache!.threadMembers.set(threadMemberKey(threadId, botId), {
      id: threadId,
      user_id: botId,
      join_timestamp: "2026-01-01T00:00:00.000Z",
      flags: 0,
    } as never);
    expect(((await client.threads.get(threadId)) as PublicThreadChannel).joined).toBe(true);
  });

  test("GIVEN a DM THEN recipient is the cached user, else the payload's", async () => {
    const client = createClient();
    await seed(client);
    const cached = (await client.channels.get(dmId)) as DMChannel;
    expect(cached.recipientId).toBe(userId);
    expect(cached.recipient?.username).toBe("wolf");

    const uncached = client.channels.createStructure(dm as never) as DMChannel;
    expect(uncached.recipient?.username).toBe("stale");
  });

  test("GIVEN a live stage THEN stageChannel.stageInstance resolves it", async () => {
    const client = createClient();
    await seed(client);
    expect(((await client.channels.get(stageId)) as StageChannel).stageInstance).toBeNull();

    await client.cache!.stageInstances.set(stageInstanceKey(guildId, stageId), {
      id: "300000000000000030",
      guild_id: guildId,
      channel_id: stageId,
      topic: "Howling",
      privacy_level: StageInstancePrivacyLevel.GuildOnly,
      discoverable_disabled: true,
      guild_scheduled_event_id: null,
    } as never);
    const resolved = (await client.channels.get(stageId)) as StageChannel;
    expect(resolved.stageInstance?.topic).toBe("Howling");
    expect(resolved.stageInstance?.channel).toBe(resolved);
  });
});

describe("guild channel relations", () => {
  test("GIVEN cached channels THEN the guild's special channels resolve", async () => {
    const client = createClient();
    await seed(client);
    await client.cache!.guilds.set(guildId, {
      ...guild,
      afk_channel_id: stageId,
      system_channel_id: channelId,
      rules_channel_id: channelId,
      public_updates_channel_id: "299999999999999999",
      widget_channel_id: null,
    } as never);

    const resolved = (await client.guilds.get(guildId))!;

    expect(resolved.afkChannel?.id).toBe(stageId);
    expect(resolved.systemChannel?.id).toBe(channelId);
    expect(resolved.systemChannel?.guild).toBe(resolved);
    expect(resolved.rulesChannel?.id).toBe(channelId);
    expect(resolved.publicUpdatesChannel).toBeNull();
    expect(resolved.widgetChannel).toBeNull();
    expect(resolved.safetyAlertsChannel).toBeNull();

    resolved[kPatch]({ system_channel_id: null });
    expect(resolved.systemChannel).toBeNull();
  });

  test("GIVEN a guild nested in another structure THEN its channels come from the synchronous cache", async () => {
    const client = createClient();
    await seed(client);
    await client.cache!.guilds.set(guildId, { ...guild, system_channel_id: channelId } as never);

    const channel = (await client.channels.get(channelId)) as TextChannel;

    expect((channel.guild as Guild).systemChannel?.id).toBe(channelId);
  });

  test("GIVEN no cache THEN the guild's channels are null", () => {
    const client = createClient(false);
    const built = client.guilds.createStructure({
      ...guild,
      system_channel_id: channelId,
    } as never);
    expect(built.systemChannel).toBeNull();
  });
});

describe("voice state and thread member relations", () => {
  test("GIVEN a cached channel THEN voiceState.channel resolves, and is dropped on a move", async () => {
    const client = createClient();
    await seed(client);
    await client.cache!.voiceStates.set(voiceStateKey(guildId, userId), {
      guild_id: guildId,
      channel_id: stageId,
      user_id: userId,
      session_id: "session",
      deaf: false,
      mute: false,
      self_deaf: false,
      self_mute: false,
      self_video: false,
      suppress: false,
      request_to_speak_timestamp: null,
    } as never);

    const state = (await client.voiceStates.get(guildId, userId))!;
    expect(state.channel?.id).toBe(stageId);

    state[kPatch]({ channel_id: null });
    expect(state.channel).toBeNull();
  });

  test("GIVEN a thread member THEN its thread and user come from the cache", async () => {
    const client = createClient();
    await seed(client);
    await client.cache!.threadMembers.set(threadMemberKey(threadId, userId), {
      id: threadId,
      user_id: userId,
      join_timestamp: "2026-01-01T00:00:00.000Z",
      flags: 0,
    } as never);

    const resolved = (await client.threadMembers.get(threadId, userId))!;
    expect(resolved.thread?.id).toBe(threadId);
    expect(resolved.user?.username).toBe("wolf");

    const bare = client.threadMembers.createStructure({
      id: threadId,
      user_id: userId,
      join_timestamp: "2026-01-01T00:00:00.000Z",
      flags: 0,
    });
    expect(bare.thread).toBeNull();
    expect(bare.user).toBeNull();
  });
});

describe("typing relations", () => {
  test("GIVEN TYPING_START THEN channel, user, guild, and member come from the cache", async () => {
    const client = createClient();
    await seed(client);
    await client.cache!.members.set(memberKey(guildId, userId), {
      ...member,
      nick: "Alpha",
      guild_id: guildId,
    } as never);
    const calls: GatewayEventMap["typingStart"][] = [];
    client.on("typingStart", (...args) => calls.push(args));

    await dispatch(client, GatewayDispatchEvents.TypingStart, {
      channel_id: channelId,
      guild_id: guildId,
      user_id: userId,
      timestamp: 1_767_225_600,
      member,
    });

    const [typing] = calls[0]!;
    expect(typing.channel?.id).toBe(channelId);
    expect(typing.user?.username).toBe("wolf");
    expect(typing.guild?.id).toBe(guildId);
    expect(typing.member?.nickname).toBe("Alpha");
  });

  test("GIVEN TYPING_START without a cache THEN the payload is the fallback", async () => {
    const client = createClient(false);
    const calls: GatewayEventMap["typingStart"][] = [];
    client.on("typingStart", (...args) => calls.push(args));

    await dispatch(client, GatewayDispatchEvents.TypingStart, {
      channel_id: channelId,
      guild_id: guildId,
      user_id: userId,
      timestamp: 1_767_225_600,
      member,
    });

    const [typing] = calls[0]!;
    expect(typing.channel).toBeNull();
    expect(typing.guild).toBeNull();
    expect(typing.user?.username).toBe("wolf");
    expect(typing.member?.user?.id).toBe(userId);
  });
});
