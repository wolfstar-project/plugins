import { createInMemoryCache, memberKey, roleKey } from "@wolfstar/plugin-cache";
import {
  ChannelType,
  MessageType,
  OverwriteType,
  PermissionFlagsBits,
  type APIMessage,
  type APIUser,
} from "discord-api-types/v10";
import { describe, expect, test } from "vitest";
import {
  GatewayClient,
  PermissionsBitField,
  type GatewayClientOptions,
  type GuildMember,
  type TextChannel,
} from "../src/index.js";
import { createAsyncCache } from "./fixtures/asyncCache.js";

const botId = "266624760782258186";
const guildId = "100000000000000010";
const ownerId = "600000000000000001";
const targetId = "600000000000000002";
const peerId = "600000000000000003";
const adminId = "600000000000000004";
const channelId = "200000000000000020";
const threadId = "200000000000000021";
const moderatedChannelId = "200000000000000022";
const newsChannelId = "200000000000000023";
const modRoleId = "700000000000000072";
const lowRoleId = "700000000000000071";
const adminRoleId = "700000000000000073";
const topRoleId = "700000000000000074";
const topId = "600000000000000005";

const flags = PermissionFlagsBits;

function user(id: string): APIUser {
  return { id, username: `user-${id}`, discriminator: "0", global_name: null, avatar: null };
}

function role(id: string, position: number, permissions: bigint, color = 0) {
  return {
    id,
    name: `role-${position}`,
    guild_id: guildId,
    color,
    colors: { primary_color: color, secondary_color: null, tertiary_color: null },
    hoist: false,
    position,
    permissions: String(permissions),
    managed: false,
    mentionable: false,
    flags: 0,
  };
}

function member(id: string, roles: string[]) {
  return {
    user: user(id),
    roles,
    joined_at: "2026-01-01T00:00:00.000Z",
    deaf: false,
    mute: false,
    flags: 0,
    guild_id: guildId,
  };
}

function createClient(options: Pick<GatewayClientOptions, "cache"> = {}) {
  return new GatewayClient({
    discordPublicKey: "0".repeat(64),
    discordToken: "test-token",
    clientId: botId,
    intents: 0,
    ...options,
  });
}

interface SeedOptions {
  guildOwner?: string;
  withGuild?: boolean;
  withBot?: boolean;
  botRoles?: string[];
}

async function seed(
  client: GatewayClient,
  {
    guildOwner = ownerId,
    withGuild = true,
    withBot = true,
    botRoles = [modRoleId],
  }: SeedOptions = {},
) {
  const cache = client.cache!;
  if (withGuild) {
    await cache.guilds.set(guildId, {
      id: guildId,
      name: "Pack",
      owner_id: guildOwner,
      features: [],
      icon: null,
    } as never);
  }

  await cache.roles.set(roleKey(guildId, guildId), role(guildId, 0, flags.ViewChannel) as never);
  await cache.roles.set(
    roleKey(guildId, modRoleId),
    role(
      modRoleId,
      2,
      flags.KickMembers | flags.BanMembers | flags.ModerateMembers,
      0xff_00_00,
    ) as never,
  );
  await cache.roles.set(roleKey(guildId, lowRoleId), role(lowRoleId, 1, 0n) as never);
  await cache.roles.set(
    roleKey(guildId, adminRoleId),
    role(adminRoleId, 1, flags.Administrator) as never,
  );
  await cache.roles.set(roleKey(guildId, topRoleId), role(topRoleId, 3, 0n) as never);
  await cache.channels.set(channelId, {
    id: channelId,
    type: ChannelType.GuildText,
    name: "general",
    guild_id: guildId,
    permission_overwrites: [
      { id: guildId, type: OverwriteType.Role, allow: "0", deny: String(flags.SendMessages) },
    ],
  } as never);
  const moderated = [
    {
      id: modRoleId,
      type: OverwriteType.Role,
      allow: String(flags.ManageMessages | flags.PinMessages),
      deny: "0",
    },
  ];
  await cache.channels.set(moderatedChannelId, {
    id: moderatedChannelId,
    type: ChannelType.GuildText,
    name: "moderated",
    guild_id: guildId,
    permission_overwrites: moderated,
  } as never);
  await cache.channels.set(newsChannelId, {
    id: newsChannelId,
    type: ChannelType.GuildAnnouncement,
    name: "news",
    guild_id: guildId,
    permission_overwrites: moderated,
  } as never);
  await cache.threads.set(threadId, {
    id: threadId,
    type: ChannelType.PublicThread,
    name: "howl",
    guild_id: guildId,
    parent_id: channelId,
  } as never);

  const members: [string, string[]][] = [
    [ownerId, []],
    [targetId, [lowRoleId]],
    [peerId, [modRoleId]],
    [adminId, [adminRoleId]],
    [topId, [topRoleId]],
  ];
  if (withBot) members.push([botId, botRoles]);
  for (const [id, roles] of members) {
    await cache.users.set(id, user(id) as never);
    await cache.members.set(memberKey(guildId, id), member(id, roles) as never);
  }
}

async function memberOf(client: GatewayClient, id: string): Promise<GuildMember> {
  return (await client.members.cache.get(client.members.resolveKey(guildId, id)))!;
}

function message(authorId: string, channel: string, extra: Partial<APIMessage> = {}) {
  return {
    // A recent snowflake: bulk deletion only reaches messages newer than 14 days.
    id: String((BigInt(Date.now()) - 1_420_070_400_000n) * 4_194_304n),
    channel_id: channel,
    guild_id: guildId,
    author: user(authorId),
    content: "hello",
    timestamp: new Date().toISOString(),
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
  } as never;
}

const asynchronous = expect.objectContaining({ code: "CacheAsynchronous" });

const synchronousModes = [
  ["the default cache of instances", () => ({})],
  ["an in-memory store", () => ({ cache: createInMemoryCache() })],
] as const;

describe.each(synchronousModes)("member getters with %s", (_, options) => {
  test("GIVEN members THEN permissions are computed from the cached roles, like fetchPermissions", async () => {
    const client = createClient(options());
    await seed(client);
    const [target, owner, bot] = await Promise.all(
      [targetId, ownerId, botId].map((id) => memberOf(client, id)),
    );

    expect(target.permissions).toBeInstanceOf(PermissionsBitField);
    expect(target.permissions.has("ViewChannel")).toBe(true);
    expect(target.permissions.has("KickMembers")).toBe(false);
    expect(owner.permissions.has("Administrator")).toBe(true);
    expect(bot.permissions.has("KickMembers")).toBe(true);
    expect(target.permissions.bitField).toBe((await target.fetchPermissions()).bitField);
    expect(bot.permissions.bitField).toBe((await bot.fetchPermissions()).bitField);
  });

  test("GIVEN a channel with overwrites THEN permissionsIn and permissionsFor apply them, threads using their parent", async () => {
    const client = createClient(options());
    await seed(client);
    const target = await memberOf(client, targetId);
    const channel = (await client.channels.cache.get(channelId)) as TextChannel;
    const low = (await client.roles.cache.get(client.roles.resolveKey(guildId, lowRoleId)))!;

    expect(target.permissionsIn(channelId).has("ViewChannel")).toBe(true);
    expect(target.permissionsIn(channelId).has("SendMessages")).toBe(false);
    expect(target.permissionsIn(channel).has("SendMessages")).toBe(false);
    expect(target.permissionsIn(threadId).has("SendMessages")).toBe(false);
    expect(target.permissionsIn(threadId).has("ViewChannel")).toBe(true);
    expect(channel.permissionsFor(target).bitField).toBe(target.permissionsIn(channelId).bitField);
    expect(channel.permissionsFor(targetId).bitField).toBe(
      target.permissionsIn(channelId).bitField,
    );
    expect(low.permissionsIn(channelId).has("ViewChannel")).toBe(true);
    expect(low.permissionsIn(channelId).has("SendMessages")).toBe(false);
    expect(target.permissionsIn(channelId).bitField).toBe(
      (await target.fetchPermissionsIn(channelId)).bitField,
    );
    expect(low.permissionsIn(channelId).bitField).toBe(
      (await low.fetchPermissionsIn(channelId)).bitField,
    );
  });

  test("GIVEN the role hierarchy THEN manageable follows it, like fetchManageable", async () => {
    const client = createClient(options());
    await seed(client);
    const [target, owner, bot, peer] = await Promise.all(
      [targetId, ownerId, botId, peerId].map((id) => memberOf(client, id)),
    );

    expect(target.manageable).toBe(true);
    expect(owner.manageable).toBe(false);
    expect(bot.manageable).toBe(false);
    expect(peer.manageable).toBe(false);
    expect((await memberOf(client, topId)).manageable).toBe(false);
    for (const each of [target, owner, bot, peer]) {
      expect(each.manageable).toBe(await each.fetchManageable());
    }
  });

  test("GIVEN the bot owns the guild THEN everyone else is manageable", async () => {
    const client = createClient(options());
    await seed(client, { guildOwner: botId });

    expect((await memberOf(client, peerId)).manageable).toBe(true);
    expect((await memberOf(client, botId)).manageable).toBe(false);
  });

  test("GIVEN the bot's permissions THEN kickable, bannable and moderatable follow them", async () => {
    const client = createClient(options());
    await seed(client);
    const target = await memberOf(client, targetId);
    const admin = await memberOf(client, adminId);

    expect([target.kickable, target.bannable, target.moderatable]).toEqual([true, true, true]);
    expect(admin.kickable).toBe(true);
    expect(admin.moderatable).toBe(false);
    expect(target.kickable).toBe(await target.fetchKickable());
    expect(target.bannable).toBe(await target.fetchBannable());
    expect(admin.moderatable).toBe(await admin.fetchModeratable());
  });

  test("GIVEN a colored role THEN displayColor and displayHexColor use it", async () => {
    const client = createClient(options());
    await seed(client);
    const peer = await memberOf(client, peerId);
    const target = await memberOf(client, targetId);

    expect(peer.displayColor).toBe(0xff_00_00);
    expect(peer.displayHexColor).toBe("#ff0000");
    expect(target.displayColor).toBe(0);
    expect(target.displayHexColor).toBe("#000000");
  });

  test("GIVEN the guild is not cached THEN permissions throws GuildUncached", async () => {
    const client = createClient(options());
    await seed(client, { withGuild: false });
    const target = await memberOf(client, targetId);

    expect(() => target.permissions).toThrow(expect.objectContaining({ code: "GuildUncached" }));
  });

  test("GIVEN the bot's member is not cached THEN manageable throws GuildUncachedMe", async () => {
    const client = createClient(options());
    await seed(client, { withBot: false });
    const target = await memberOf(client, targetId);

    expect(() => target.manageable).toThrow(expect.objectContaining({ code: "GuildUncachedMe" }));
    expect(() => target.kickable).toThrow(expect.objectContaining({ code: "GuildUncachedMe" }));
  });

  test("GIVEN an unknown channel or member THEN permissionsIn and permissionsFor throw", async () => {
    const client = createClient(options());
    await seed(client);
    const target = await memberOf(client, targetId);
    const channel = (await client.channels.cache.get(channelId)) as TextChannel;

    expect(() => target.permissionsIn("200000000000000099")).toThrow(
      expect.objectContaining({ code: "ChannelUncached" }),
    );
    expect(() => channel.permissionsFor("600000000000000099")).toThrow(
      expect.objectContaining({ code: "GuildMemberUncached" }),
    );
  });

  test("GIVEN a thread whose parent is not cached THEN permissionsIn throws ChannelUncached", async () => {
    const client = createClient(options());
    await seed(client);
    await client.cache!.threads.set("200000000000000041", {
      id: "200000000000000041",
      type: ChannelType.PublicThread,
      name: "orphan",
      guild_id: guildId,
      parent_id: "200000000000000040",
    } as never);
    const target = await memberOf(client, targetId);

    expect(() => target.permissionsIn("200000000000000041")).toThrow(
      expect.objectContaining({ code: "ChannelUncached" }),
    );
  });

  test("GIVEN another client constructed later THEN a member ID is resolved by the channel's own client", async () => {
    const client = createClient(options());
    await seed(client);
    const target = await memberOf(client, targetId);
    const channel = (await client.channels.cache.get(channelId)) as TextChannel;
    createClient(options());

    expect(channel.permissionsFor(targetId).bitField).toBe(
      target.permissionsIn(channelId).bitField,
    );
    expect(target.permissionsIn(channelId).has("ViewChannel")).toBe(true);
  });
});

describe("member getters with an asynchronous cache", () => {
  test("GIVEN an asynchronous cache THEN the getters throw CacheAsynchronous and the fetch methods answer", async () => {
    const client = createClient({ cache: createAsyncCache() });
    await seed(client);
    const target = await memberOf(client, targetId);

    expect(() => target.permissions).toThrow(asynchronous);
    expect(() => target.manageable).toThrow(asynchronous);
    expect(() => target.kickable).toThrow(asynchronous);
    expect(() => target.permissionsIn(channelId)).toThrow(asynchronous);
    expect(() => target.displayColor).toThrow(asynchronous);
    expect((await target.fetchPermissions()).has("ViewChannel")).toBe(true);
    expect(await target.fetchManageable()).toBe(true);
    // An unhandled rejection of an abandoned read would fail the run.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});

describe.each(synchronousModes)("message, role and emoji getters with %s", (_, options) => {
  test("GIVEN the bot's own message THEN it is editable and deletable", async () => {
    const client = createClient(options());
    await seed(client);
    const own = await client.messages._build(message(botId, channelId));

    expect(own.editable).toBe(true);
    expect(own.deletable).toBe(true);
    expect(own.editable).toBe(await own.fetchEditable());
  });

  test("GIVEN someone else's message THEN deletable, bulkDeletable and pinnable follow the channel permissions", async () => {
    const client = createClient(options());
    await seed(client);
    const plain = await client.messages._build(message(targetId, channelId));
    const moderated = await client.messages._build(message(targetId, moderatedChannelId));
    const old = await client.messages._build(
      message(targetId, moderatedChannelId, { id: "1200000000000000000" }),
    );
    const system = await client.messages._build(
      message(targetId, moderatedChannelId, { type: MessageType.UserJoin }),
    );

    expect(plain.editable).toBe(false);
    expect([plain.deletable, plain.bulkDeletable, plain.pinnable]).toEqual([false, false, false]);
    expect([moderated.deletable, moderated.bulkDeletable, moderated.pinnable]).toEqual([
      true,
      true,
      true,
    ]);
    expect(old.bulkDeletable).toBe(false);
    expect(system.pinnable).toBe(false);
    expect(moderated.deletable).toBe(await moderated.fetchDeletable());
    expect(moderated.bulkDeletable).toBe(await moderated.fetchBulkDeletable());
    expect(moderated.pinnable).toBe(await moderated.fetchPinnable());
    expect(plain.deletable).toBe(await plain.fetchDeletable());
  });

  test("GIVEN a message outside of a guild THEN only the author can delete it, and anyone can pin it", async () => {
    const client = createClient(options());
    await seed(client);
    const dm = await client.messages._build(
      message(targetId, "200000000000000030", { guild_id: undefined } as never),
    );

    expect(dm.deletable).toBe(false);
    expect(dm.pinnable).toBe(true);
    expect(dm.crosspostable).toBe(false);
  });

  test("GIVEN an announcement channel THEN crosspostable follows the channel type and permissions", async () => {
    const client = createClient(options());
    await seed(client);
    const news = await client.messages._build(message(targetId, newsChannelId));
    const text = await client.messages._build(message(targetId, moderatedChannelId));
    const uncached = await client.messages._build(message(targetId, "200000000000000099"));

    expect(news.crosspostable).toBe(true);
    expect(text.crosspostable).toBe(false);
    expect(news.crosspostable).toBe(await news.fetchCrosspostable());
    expect(() => uncached.crosspostable).toThrow(
      expect.objectContaining({ code: "ChannelUncached" }),
    );
  });

  test("GIVEN the bot's roles THEN role.editable follows ManageRoles and the hierarchy", async () => {
    const client = createClient(options());
    await seed(client, { botRoles: [adminRoleId, modRoleId] });
    const roleOf = async (id: string) =>
      (await client.roles.cache.get(client.roles.resolveKey(guildId, id)))!;
    const [low, mod] = await Promise.all([roleOf(lowRoleId), roleOf(modRoleId)]);

    expect(low.editable).toBe(true);
    expect(mod.editable).toBe(false);
    expect(low.editable).toBe(await low.fetchEditable());
    expect(mod.editable).toBe(await mod.fetchEditable());
  });

  test("GIVEN a bot without ManageRoles THEN no role is editable", async () => {
    const client = createClient(options());
    await seed(client);
    const low = (await client.roles.cache.get(client.roles.resolveKey(guildId, lowRoleId)))!;

    expect(low.editable).toBe(false);
  });

  test("GIVEN an emoji THEN deletable follows ManageGuildExpressions", async () => {
    const data = { id: "900000000000000090", name: "howl", guild_id: guildId, managed: false };
    const admin = createClient(options());
    await seed(admin, { botRoles: [adminRoleId] });
    const deletable = await admin.guilds.emojis(guildId)._build(data as never);
    expect(deletable.deletable).toBe(true);
    expect(deletable.deletable).toBe(await deletable.fetchDeletable());

    const plain = createClient(options());
    await seed(plain);
    const kept = await plain.guilds.emojis(guildId)._build(data as never);
    expect(kept.deletable).toBe(false);
  });

  test("GIVEN an invite THEN deletable follows its inviter and ManageGuild", async () => {
    const admin = createClient(options());
    await seed(admin, { botRoles: [adminRoleId] });
    const foreign = await admin.guilds.invites(guildId)._build({
      code: "abc",
      guild_id: guildId,
      inviter: user(targetId),
    } as never);

    expect(foreign.deletable).toBe(true);
    expect(foreign.deletable).toBe(await foreign.fetchDeletable());
  });
});

describe("message getters with an asynchronous cache", () => {
  test("GIVEN an asynchronous cache THEN deletable throws CacheAsynchronous for someone else's guild message", async () => {
    const client = createClient({ cache: createAsyncCache() });
    await seed(client);
    const theirs = await client.messages._build(message(targetId, moderatedChannelId));
    const own = await client.messages._build(message(botId, moderatedChannelId));

    expect(() => theirs.deletable).toThrow(asynchronous);
    expect(() => theirs.pinnable).toThrow(asynchronous);
    // The author check needs no cache.
    expect(own.editable).toBe(true);
    expect(own.deletable).toBe(true);
    expect(await theirs.fetchDeletable()).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});

describe("every derived getter with an asynchronous cache", () => {
  test("GIVEN an asynchronous cache THEN each getter needing the cache throws CacheAsynchronous", async () => {
    const client = createClient({ cache: createAsyncCache() });
    await seed(client);
    const target = await memberOf(client, targetId);
    const channel = (await client.channels.cache.get(channelId)) as TextChannel;
    const low = (await client.roles.cache.get(client.roles.resolveKey(guildId, lowRoleId)))!;
    const theirs = await client.messages._build(message(targetId, newsChannelId));
    const emoji = await client.guilds
      .emojis(guildId)
      ._build({ id: "900000000000000090", name: "howl", guild_id: guildId } as never);
    const invite = await client.guilds
      .invites(guildId)
      ._build({ code: "abc", guild_id: guildId, inviter: user(targetId) } as never);

    const getters: [string, () => unknown][] = [
      ["member.bannable", () => target.bannable],
      ["member.moderatable", () => target.moderatable],
      ["member.displayHexColor", () => target.displayHexColor],
      ["channel.permissionsFor(member)", () => channel.permissionsFor(target)],
      ["channel.permissionsFor(id)", () => channel.permissionsFor(targetId)],
      ["channel.permissionsFor(role)", () => channel.permissionsFor(low)],
      ["role.editable", () => low.editable],
      ["role.permissionsIn", () => low.permissionsIn(channelId)],
      ["message.bulkDeletable", () => theirs.bulkDeletable],
      ["message.crosspostable", () => theirs.crosspostable],
      ["emoji.deletable", () => emoji.deletable],
      ["invite.deletable", () => invite.deletable],
    ];
    for (const [name, read] of getters) {
      expect(read, name).toThrow(asynchronous);
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
