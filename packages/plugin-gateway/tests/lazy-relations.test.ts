import { createInMemoryCache, memberKey, messageKey, roleKey } from "@wolfstar/plugin-cache";
import { ChannelType, MessageType, type APIMessage, type APIUser } from "discord-api-types/v10";
import { describe, expect, test } from "vitest";
import {
  AutoModerationActionExecution,
  bindClient,
  createChannel,
  GatewayClient,
  GuildMember,
  Message,
  MessageReaction,
  Presence,
  Role,
  VoiceState,
  type GatewayClientOptions,
  type TextChannel,
} from "../src/index.js";
import { createAsyncCache } from "./fixtures/asyncCache.js";

const guildId = "100000000000000010";
const categoryId = "200000000000000019";
const channelId = "200000000000000020";
const messageId = "1200000000000000000";
const roleId = "700000000000000070";
const user: APIUser = {
  id: "600000000000000600",
  username: "wolf",
  discriminator: "0",
  global_name: null,
  avatar: null,
};
const member = {
  user,
  roles: [],
  joined_at: "2026-01-01T00:00:00.000Z",
  deaf: false,
  mute: false,
  flags: 0,
  guild_id: guildId,
};
const role = {
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
};
const channel = {
  id: channelId,
  type: ChannelType.GuildText,
  name: "general",
  guild_id: guildId,
  parent_id: categoryId,
  permission_overwrites: [],
};
const voiceState = {
  guild_id: guildId,
  channel_id: channelId,
  user_id: user.id,
  session_id: "s",
  deaf: false,
  mute: false,
  self_deaf: false,
  self_mute: false,
  self_video: false,
  suppress: false,
  request_to_speak_timestamp: null,
};

function message(extra: Partial<APIMessage> = {}): APIMessage {
  return {
    id: messageId,
    channel_id: channelId,
    guild_id: guildId,
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
  } as APIMessage;
}

function createClient(options: Pick<GatewayClientOptions, "cache"> = {}) {
  return new GatewayClient({
    discordPublicKey: "0".repeat(64),
    discordToken: "test-token",
    clientId: "266624760782258186",
    intents: 0,
    ...options,
  });
}

async function seed(client: GatewayClient, withChannel = true) {
  const cache = client.cache!;
  await cache.guilds.set(guildId, { id: guildId, name: "Pack", features: [], icon: null } as never);
  await cache.channels.set(categoryId, {
    id: categoryId,
    type: ChannelType.GuildCategory,
    name: "den",
    guild_id: guildId,
    permission_overwrites: [],
  } as never);
  if (withChannel) await cache.channels.set(channelId, channel as never);
  await cache.users.set(user.id, user as never);
  await cache.members.set(memberKey(guildId, user.id), member as never);
  await cache.roles.set(roleKey(guildId, roleId), role as never);
  await cache.messages.set(messageKey(channelId, messageId), message() as never);
  await cache.voiceStates.set(client.voiceStates.resolveKey(guildId, user.id), voiceState as never);
}

const synchronousModes = [
  ["the default cache of instances", () => ({})],
  ["an in-memory store", () => ({ cache: createInMemoryCache() })],
] as const;

describe.each(synchronousModes)("lazy relations with %s", (_, options) => {
  test("GIVEN a message built by hand THEN its guild and channel come from the cache", async () => {
    const client = createClient(options());
    await seed(client);
    const built = bindClient(new Message(message() as never), client);

    expect(built.guild?.id).toBe(guildId);
    expect(built.guild?.name).toBe("Pack");
    expect(built.channel?.id).toBe(channelId);
  });

  test("GIVEN a member and a role built by hand THEN their guild comes from the cache", async () => {
    const client = createClient(options());
    await seed(client);

    expect(bindClient(new GuildMember(member as never), client).guild?.id).toBe(guildId);
    expect(bindClient(new Role(role as never), client).guild?.id).toBe(guildId);
  });

  test("GIVEN a member built by hand THEN its voice state comes from the cache", async () => {
    const client = createClient(options());
    await seed(client);

    expect(bindClient(new GuildMember(member as never), client).voice?.channelId).toBe(channelId);
  });

  test("GIVEN a channel built by hand THEN its guild, parent and permissionsLocked come from the cache", async () => {
    const client = createClient(options());
    await seed(client);
    const built = bindClient(createChannel(channel as never) as TextChannel, client);

    expect(built.guild?.id).toBe(guildId);
    expect(built.parent?.id).toBe(categoryId);
    expect(built.permissionsLocked).toBe(true);
  });

  test("GIVEN a reaction and a voice state built by hand THEN their relations come from the cache", async () => {
    const client = createClient(options());
    await seed(client);
    const reaction = bindClient(
      new MessageReaction({
        channel_id: channelId,
        message_id: messageId,
        emoji: { id: null, name: "🐺" },
      } as never),
      client,
    );
    const voice = bindClient(new VoiceState(voiceState as never), client);

    expect(reaction.message?.id).toBe(messageId);
    expect(voice.guild?.id).toBe(guildId);
    expect(voice.channel?.id).toBe(channelId);
    expect(voice.member?.id).toBe(user.id);
  });

  test("GIVEN a presence and an auto moderation execution built by hand THEN their user and member come from the cache", async () => {
    const client = createClient(options());
    await seed(client);
    const raw = { user: { id: user.id }, guild_id: guildId, status: "online", activities: [] };
    await client.cache!.presences.set(client.presences.resolveKey(guildId, user.id), raw as never);
    const presence = bindClient(new Presence(raw as never), client);
    const execution = bindClient(
      new AutoModerationActionExecution({
        guild_id: guildId,
        user_id: user.id,
        channel_id: channelId,
        rule_id: "1",
        rule_trigger_type: 1,
        action: { type: 1 },
        content: "",
        matched_keyword: null,
        matched_content: null,
      } as never),
      client,
    );

    expect(presence.user?.username).toBe("wolf");
    expect(presence.member?.id).toBe(user.id);
    expect(presence.guild?.id).toBe(guildId);
    expect(bindClient(new GuildMember(member as never), client).presence?.status).toBe("online");
    expect(execution.user?.username).toBe("wolf");
    expect(execution.member?.id).toBe(user.id);
    expect(execution.channel?.id).toBe(channelId);
    expect(execution.guild?.id).toBe(guildId);
  });

  test("GIVEN a relation that was not cached when the structure was built THEN it is found once cached", async () => {
    const client = createClient(options());
    await seed(client, false);
    const built = await client.messages._build(message() as never);

    expect(built.channel).toBeNull();
    await client.cache!.channels.set(channelId, channel as never);

    expect(built.channel?.id).toBe(channelId);
  });
});

describe("lazy relations with an asynchronous cache", () => {
  test("GIVEN a structure built by hand THEN its relations are null, without throwing", async () => {
    const client = createClient({ cache: createAsyncCache() });
    await seed(client);
    const built = bindClient(new Message(message() as never), client);

    expect(built.guild).toBeNull();
    expect(built.channel).toBeNull();
    expect(bindClient(new GuildMember(member as never), client).voice).toBeNull();
  });
});

describe("lazy relations with the default cache of instances", () => {
  test("GIVEN a guild read by a relation getter THEN it is the instance the cache holds", async () => {
    const client = createClient();
    await seed(client);
    const built = bindClient(new Message(message() as never), client);

    expect(built.guild).toBe(built.guild);
    expect(built.guild).toBe(await client.guilds.cache.get(guildId));
  });
});
