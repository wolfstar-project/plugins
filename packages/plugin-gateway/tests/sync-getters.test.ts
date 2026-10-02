import { createInMemoryCache, memberKey, roleKey } from "@wolfstar/plugin-cache";
import {
  ChannelType,
  OverwriteType,
  PermissionFlagsBits,
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
const modRoleId = "700000000000000072";
const lowRoleId = "700000000000000071";
const adminRoleId = "700000000000000073";

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
}

async function seed(
  client: GatewayClient,
  { guildOwner = ownerId, withGuild = true, withBot = true }: SeedOptions = {},
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
  await cache.channels.set(channelId, {
    id: channelId,
    type: ChannelType.GuildText,
    name: "general",
    guild_id: guildId,
    permission_overwrites: [
      { id: guildId, type: OverwriteType.Role, allow: "0", deny: String(flags.SendMessages) },
    ],
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
  ];
  if (withBot) members.push([botId, [modRoleId]]);
  for (const [id, roles] of members) {
    await cache.users.set(id, user(id) as never);
    await cache.members.set(memberKey(guildId, id), member(id, roles) as never);
  }
}

async function memberOf(client: GatewayClient, id: string): Promise<GuildMember> {
  return (await client.members.cache.get(client.members.resolveKey(guildId, id)))!;
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
