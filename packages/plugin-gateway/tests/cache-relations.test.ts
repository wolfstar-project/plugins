import { WebSocketShardEvents } from "@discordjs/ws";
import {
  ChannelType,
  GatewayDispatchEvents,
  GatewayOpcodes,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  GuildScheduledEventStatus,
  MessageType,
  PresenceUpdateStatus,
  StickerFormatType,
  StickerType,
  type GatewayDispatchPayload,
} from "discord-api-types/v10";
import { describe, expect, test } from "vitest";
import {
  GatewayClient,
  Guild,
  GuildMember,
  Message,
  type StageChannel,
  type TextChannel,
} from "../src/index.js";

const guildId = "100000000000000010";
const categoryId = "200000000000000020";
const textId = "200000000000000021";
const voiceId = "200000000000000022";
const stageId = "200000000000000023";
const threadId = "200000000000000024";
const roleId = "300000000000000030";
const emojiId = "400000000000000040";
const stickerId = "400000000000000041";
const eventId = "400000000000000042";
const soundId = "400000000000000043";
const stageInstanceId = "400000000000000044";
const messageId = "500000000000000050";
const userId = "600000000000000600";
const user = {
  id: userId,
  username: "wolf",
  discriminator: "0",
  global_name: "Wolf",
  avatar: null,
};
// As messages carry it: without the user.
const partialMember = {
  roles: [roleId],
  joined_at: "2026-01-01T00:00:00.000Z",
  deaf: false,
  mute: false,
  flags: 0,
};
const member = { ...partialMember, user };

const guild = {
  id: guildId,
  name: "Pack",
  owner_id: userId,
  channels: [
    { id: categoryId, type: ChannelType.GuildCategory, name: "north", position: 0 },
    { id: textId, type: ChannelType.GuildText, name: "den", parent_id: categoryId, position: 1 },
    { id: voiceId, type: ChannelType.GuildVoice, name: "howl", parent_id: categoryId },
    { id: stageId, type: ChannelType.GuildStageVoice, name: "stage", parent_id: categoryId },
  ],
  threads: [
    {
      id: threadId,
      type: ChannelType.PublicThread,
      name: "trail",
      parent_id: textId,
      owner_id: userId,
      thread_metadata: {
        archived: false,
        auto_archive_duration: 60,
        archive_timestamp: "2026-01-01T00:00:00.000Z",
        locked: false,
      },
      member: {
        id: threadId,
        user_id: userId,
        join_timestamp: "2026-01-01T00:00:00.000Z",
        flags: 0,
      },
    },
  ],
  roles: [
    { id: guildId, name: "@everyone", permissions: "0", position: 0 },
    { id: roleId, name: "alpha", permissions: "8", position: 1 },
  ],
  members: [member],
  voice_states: [
    {
      channel_id: voiceId,
      user_id: userId,
      session_id: "session",
      deaf: false,
      mute: false,
      self_deaf: false,
      self_mute: false,
      self_video: false,
      suppress: false,
      request_to_speak_timestamp: null,
    },
  ],
  presences: [
    {
      user: { id: userId },
      status: PresenceUpdateStatus.Online,
      activities: [],
      client_status: { desktop: PresenceUpdateStatus.Online },
    },
  ],
  emojis: [{ id: emojiId, name: "paw", roles: [roleId], user, available: true }],
  stickers: [
    {
      id: stickerId,
      name: "moon",
      description: null,
      tags: "moon",
      type: StickerType.Guild,
      format_type: StickerFormatType.PNG,
      guild_id: guildId,
      user,
    },
  ],
  stage_instances: [
    {
      id: stageInstanceId,
      guild_id: guildId,
      channel_id: stageId,
      topic: "howling",
      privacy_level: 2,
      discoverable_disabled: false,
      guild_scheduled_event_id: eventId,
    },
  ],
  guild_scheduled_events: [
    {
      id: eventId,
      guild_id: guildId,
      channel_id: stageId,
      creator_id: userId,
      creator: user,
      name: "full moon",
      scheduled_start_time: "2026-02-01T00:00:00.000Z",
      scheduled_end_time: null,
      privacy_level: GuildScheduledEventPrivacyLevel.GuildOnly,
      status: GuildScheduledEventStatus.Scheduled,
      entity_type: GuildScheduledEventEntityType.StageInstance,
      entity_id: null,
      entity_metadata: null,
    },
  ],
  soundboard_sounds: [
    {
      sound_id: soundId,
      name: "awoo",
      volume: 1,
      emoji_id: emojiId,
      emoji_name: null,
      guild_id: guildId,
      available: true,
      user,
    },
  ],
};

const message = {
  id: messageId,
  channel_id: textId,
  guild_id: guildId,
  author: user,
  member: partialMember,
  content: `hello <@${userId}> <@&${roleId}> <#${textId}>`,
  mentions: [{ ...user, member: partialMember }],
  mention_roles: [roleId],
  attachments: [],
  embeds: [],
  pinned: false,
  tts: false,
  mention_everyone: false,
  timestamp: "2026-01-01T00:00:00.000Z",
  edited_timestamp: null,
  type: MessageType.Default,
};

async function dispatch(client: GatewayClient, t: GatewayDispatchEvents, d: unknown) {
  const payload = { op: GatewayOpcodes.Dispatch, s: 1, t, d } as GatewayDispatchPayload;
  client.gateway.emit(WebSocketShardEvents.Dispatch, payload, 0);
  await client.idle();
}

async function populate() {
  const client = new GatewayClient({
    discordPublicKey: "0".repeat(64),
    discordToken: "test-token",
    clientId: "266624760782258186",
    intents: 0,
  });
  const errors: unknown[] = [];
  client.on("error", (error) => errors.push(error));
  client.on("cacheError", (error) => errors.push(error));

  await dispatch(client, GatewayDispatchEvents.GuildCreate, guild);
  await dispatch(client, GatewayDispatchEvents.MessageCreate, message);

  return { client, errors };
}

// Every entity refreshes its relations on `cache.get`, by reading the caches of other entities: a guild reads its
// channels, which read their guild, and so on. A cycle in those reads overflows the stack on the first `cache.get`,
// which is the worst regression the caches of instances can have.
describe("cross-manager relations with the default cache", () => {
  test("GIVEN a full GUILD_CREATE and a MESSAGE_CREATE THEN cache.get resolves for every populated entity", async () => {
    const { client, errors } = await populate();
    const guilds = client.guilds;
    const keys = {
      guilds: guildId,
      channels: stageId,
      threads: threadId,
      threadMembers: client.threadMembers.resolveKey(threadId, userId),
      roles: client.roles.resolveKey(guildId, roleId),
      members: client.members.resolveKey(guildId, userId),
      users: userId,
      voiceStates: client.voiceStates.resolveKey(guildId, userId),
      presences: client.presences.resolveKey(guildId, userId),
      emojis: guilds.emojis(guildId).resolveKey(emojiId),
      stickers: guilds.stickers(guildId).resolveKey(stickerId),
      stageInstances: guilds.stageInstances(guildId).resolveKey(stageId),
      scheduledEvents: guilds.scheduledEvents(guildId).resolveKey(eventId),
      soundboardSounds: guilds.soundboardSounds(guildId).resolveKey(soundId),
      messages: client.messages.resolveKey(textId, messageId),
    } as const;
    const caches = {
      guilds: guilds.cache,
      channels: client.channels.cache,
      threads: client.threads.cache,
      threadMembers: client.threadMembers.cache,
      roles: client.roles.cache,
      members: client.members.cache,
      users: client.users.cache,
      voiceStates: client.voiceStates.cache,
      presences: client.presences.cache,
      emojis: guilds.emojis(guildId).cache,
      stickers: guilds.stickers(guildId).cache,
      stageInstances: guilds.stageInstances(guildId).cache,
      scheduledEvents: guilds.scheduledEvents(guildId).cache,
      soundboardSounds: guilds.soundboardSounds(guildId).cache,
      messages: client.messages.cache,
    } as const;

    expect(errors).toEqual([]);
    for (const [name, cache] of Object.entries(caches)) {
      const key = keys[name as keyof typeof keys];
      expect(cache.synchronous, name).toBe(true);

      let value: unknown;
      expect(() => (value = cache.get(key)), `${name}.cache.get("${key}")`).not.toThrow();
      expect(value, `${name}.cache.get("${key}")`).toBeDefined();
      // Twice: the second read refreshes relations that the first one already resolved.
      expect(cache.get(key), name).toBe(value);
    }

    // Every other entry too, whatever its key. `client.channels.cache` wraps two caches, so it is read by ID.
    for (const [name, cache] of Object.entries(caches)) {
      const entryKeys = cache instanceof Map ? [...cache.keys()] : [categoryId, textId, voiceId];
      for (const key of entryKeys as string[]) {
        expect(() => cache.get(key), `${name}.cache.get("${key}")`).not.toThrow();
        expect(cache.get(key), `${name}.cache.get("${key}")`).toBeDefined();
      }
    }

    expect(errors).toEqual([]);
  });

  test("GIVEN the populated caches THEN the relations are resolved across managers", async () => {
    const { client } = await populate();

    const cachedMember = client.members.cache.get(client.members.resolveKey(guildId, userId));
    expect(cachedMember).toBeInstanceOf(GuildMember);
    expect(cachedMember?.voice?.channelId).toBe(voiceId);
    expect(cachedMember?.presence?.status).toBe(PresenceUpdateStatus.Online);
    expect(cachedMember?.user?.username).toBe("wolf");
    expect(cachedMember?.guild).toBeInstanceOf(Guild);
    expect(cachedMember?.guild?.name).toBe("Pack");

    const text = client.channels.cache.get(textId) as TextChannel | undefined;
    expect(text?.parent?.id).toBe(categoryId);
    expect(text?.parent?.name).toBe("north");
    expect(text?.guild?.id).toBe(guildId);

    const stage = client.channels.cache.get(stageId) as StageChannel | undefined;
    expect(stage?.parent?.id).toBe(categoryId);
    expect(stage?.stageInstance?.topic).toBe("howling");

    const thread = client.threads.cache.get(threadId);
    expect(thread?.parentId).toBe(textId);
    expect(thread?.guild?.id).toBe(guildId);

    const cachedMessage = client.messages.cache.get(client.messages.resolveKey(textId, messageId));
    expect(cachedMessage).toBeInstanceOf(Message);
    expect(cachedMessage?.author.username).toBe("wolf");
    expect(cachedMessage?.member?.voice?.channelId).toBe(voiceId);
    expect(cachedMessage?.guild?.name).toBe("Pack");

    const emoji = client.guilds
      .emojis(guildId)
      .cache.get(client.guilds.emojis(guildId).resolveKey(emojiId));
    expect(emoji?.author?.id).toBe(userId);
    expect(emoji?.guild?.id).toBe(guildId);

    expect(
      client.voiceStates.cache.get(client.voiceStates.resolveKey(guildId, userId))?.member?.id,
    ).toBe(userId);
  });

  test("GIVEN a cached message THEN author and channel are the cached instances, and guild a copy", async () => {
    const { client } = await populate();

    const cachedMessage = client.messages.cache.get(client.messages.resolveKey(textId, messageId));

    expect(cachedMessage?.author).toBe(client.users.cache.get(userId));
    expect(cachedMessage?.channel).toBe(client.channels.cache.get(textId));
    expect(cachedMessage?.guild).not.toBe(client.guilds.cache.get(guildId));
    expect(cachedMessage?.guild?.toJSON()).toEqual(client.guilds.cache.get(guildId)?.toJSON());
  });

  test("GIVEN guild relations and listCached THEN they are copies of the cached instances", async () => {
    const { client } = await populate();
    const cachedGuild = client.guilds.cache.get(guildId);
    const key = client.members.resolveKey(guildId, userId);

    expect(client.members.cache.get(key)?.guild).not.toBe(cachedGuild);
    expect((client.channels.cache.get(textId) as TextChannel).guild).not.toBe(cachedGuild);
    expect(client.roles.cache.get(client.roles.resolveKey(guildId, roleId))?.guild?.id).toBe(
      guildId,
    );

    const listed = await client.voiceStates.listCached(guildId);
    expect(listed.map((state) => state.channelId)).toEqual([voiceId]);
    expect(listed[0]).not.toBe(client.voiceStates.cache.get(key));
  });

  test("GIVEN messageCreate THEN the emitted message is freshly built, not the cached instance", async () => {
    const { client } = await populate();
    const emitted: Message[] = [];
    client.on("messageCreate", (created) => emitted.push(created));
    const second = "500000000000000051";

    await dispatch(client, GatewayDispatchEvents.MessageCreate, { ...message, id: second });

    const cached = client.messages.cache.get(client.messages.resolveKey(textId, second));
    expect(emitted).toHaveLength(1);
    expect(emitted[0]!.id).toBe(second);
    expect(cached?.id).toBe(second);
    expect(emitted[0]).not.toBe(cached);
  });
});
