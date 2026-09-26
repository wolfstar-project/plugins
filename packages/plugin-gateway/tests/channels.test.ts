import { container } from "@wolfstar/http-framework";
import { createInMemoryCache, memberKey, messageKey, roleKey } from "@wolfstar/plugin-cache";
import {
  ChannelType,
  OverwriteType,
  PermissionFlagsBits,
  Routes,
  type APIOverwrite,
} from "discord-api-types/v10";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  computeChannelPermissions,
  GatewayClient,
  PermissionOverwrites,
  PermissionsBitField,
  resolveOverwriteOptions,
  type TextChannel,
} from "../src/index.js";

const guildId = "100000000000000010";
const channelId = "200000000000000020";
const categoryId = "200000000000000021";
const roleId = "300000000000000030";
const userId = "600000000000000600";
const { SendMessages, ViewChannel, ManageMessages, Administrator } = PermissionFlagsBits;

function createClient() {
  return new GatewayClient({
    discordPublicKey: "0".repeat(64),
    discordToken: "test-token",
    clientId: "266624760782258186",
    intents: 0,
    cache: createInMemoryCache(),
  });
}

function overwrite(id: string, type: OverwriteType, allow = 0n, deny = 0n): APIOverwrite {
  return { id, type, allow: String(allow), deny: String(deny) };
}

function textChannel(extra: Record<string, unknown> = {}) {
  return {
    id: channelId,
    type: ChannelType.GuildText,
    name: "general",
    guild_id: guildId,
    position: 1,
    parent_id: null,
    permission_overwrites: [],
    ...extra,
  };
}

async function seedGuild(client: GatewayClient, overwrites: APIOverwrite[] = []) {
  const cache = client.cache!;
  await cache.guilds.set(guildId, { id: guildId, name: "Pack", owner_id: "1" } as never);
  await cache.roles.set(roleKey(guildId, guildId), {
    id: guildId,
    name: "@everyone",
    permissions: String(ViewChannel | SendMessages),
    position: 0,
    guild_id: guildId,
  } as never);
  await cache.roles.set(roleKey(guildId, roleId), {
    id: roleId,
    name: "Alpha",
    permissions: "0",
    position: 1,
    guild_id: guildId,
  } as never);
  await cache.members.set(memberKey(guildId, userId), {
    user: { id: userId, username: "wolf", discriminator: "0", global_name: null, avatar: null },
    roles: [roleId],
    joined_at: "2026-01-01T00:00:00.000Z",
    guild_id: guildId,
  } as never);
  await cache.channels.set(channelId, textChannel({ permission_overwrites: overwrites }) as never);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("computeChannelPermissions", () => {
  const base = new PermissionsBitField(ViewChannel | SendMessages);

  test("GIVEN @everyone, role, and member overwrites THEN they apply in Discord's order", () => {
    const overwrites = [
      overwrite(guildId, OverwriteType.Role, 0n, SendMessages),
      overwrite(roleId, OverwriteType.Role, SendMessages | ManageMessages),
      overwrite(userId, OverwriteType.Member, 0n, ManageMessages),
    ];

    const everyoneOnly = computeChannelPermissions(base, { guildId, roleIds: [], overwrites });
    const member = computeChannelPermissions(base, {
      guildId,
      userId,
      roleIds: [roleId],
      overwrites,
    });

    expect(everyoneOnly.has(SendMessages)).toBe(false);
    expect(member.has(SendMessages)).toBe(true);
    expect(member.has(ManageMessages)).toBe(false);
  });

  test("GIVEN an administrator THEN overwrites do not apply", () => {
    const permissions = computeChannelPermissions(new PermissionsBitField(Administrator), {
      guildId,
      roleIds: [],
      overwrites: [overwrite(guildId, OverwriteType.Role, 0n, ViewChannel)],
    });

    expect(permissions.has(ViewChannel)).toBe(true);
  });
});

describe("resolveOverwriteOptions", () => {
  test("GIVEN true, false, and null THEN it allows, denies, and resets", () => {
    const resolved = resolveOverwriteOptions(
      { SendMessages: true, ViewChannel: false, ManageMessages: null },
      { allow: ManageMessages, deny: SendMessages },
    );

    expect(resolved).toEqual({ allow: SendMessages, deny: ViewChannel });
  });
});

describe("channel permissions", () => {
  test("GIVEN a member THEN fetchPermissionsFor applies the channel's overwrites", async () => {
    const client = createClient();
    await seedGuild(client, [overwrite(guildId, OverwriteType.Role, 0n, SendMessages)]);
    const channel = (await client.channels.get(channelId)) as TextChannel;
    const member = await client.members.get(guildId, userId);

    const permissions = await channel.fetchPermissionsFor(member!);
    const inChannel = await member!.fetchPermissionsIn(channelId);

    expect(permissions.has(ViewChannel)).toBe(true);
    expect(permissions.has(SendMessages)).toBe(false);
    expect(inChannel.bitField).toBe(permissions.bitField);
  });

  test("GIVEN a role THEN fetchPermissionsFor combines it with @everyone", async () => {
    const client = createClient();
    await seedGuild(client, [overwrite(roleId, OverwriteType.Role, ManageMessages)]);
    const channel = (await client.channels.get(channelId)) as TextChannel;
    const role = await client.roles.get(guildId, roleId);

    const permissions = await channel.fetchPermissionsFor(role!);

    expect(permissions.has(SendMessages)).toBe(true);
    expect(permissions.has(ManageMessages)).toBe(true);
  });
});

describe("permission overwrites", () => {
  test("GIVEN edit THEN it merges with the existing overwrite and patches the cache", async () => {
    const client = createClient();
    await seedGuild(client, [overwrite(roleId, OverwriteType.Role, ManageMessages)]);
    const put = vi.spyOn(container.rest, "put").mockResolvedValue(undefined);
    const channel = (await client.channels.get(channelId)) as TextChannel;

    const edited = await channel.permissionOverwrites.edit(roleId, { SendMessages: false });

    expect(edited).toBeInstanceOf(PermissionOverwrites);
    expect(put).toHaveBeenCalledWith(Routes.channelPermission(channelId, roleId), {
      body: {
        type: OverwriteType.Role,
        allow: String(ManageMessages),
        deny: String(SendMessages),
      },
      reason: undefined,
    });
    const cached = (await client.channels.get(channelId)) as TextChannel;
    expect(cached.permissionOverwrites.resolve(roleId)?.deny.has(SendMessages)).toBe(true);
  });

  test("GIVEN create with a plain ID THEN the type is guessed from the cached roles", async () => {
    const client = createClient();
    await seedGuild(client);
    const put = vi.spyOn(container.rest, "put").mockResolvedValue(undefined);
    const channel = (await client.channels.get(channelId)) as TextChannel;

    await channel.permissionOverwrites.create(roleId, { ViewChannel: true });
    await channel.permissionOverwrites.create(userId, { ViewChannel: true });

    expect(
      put.mock.calls.map(([, options]) => (options as { body: { type: number } }).body.type),
    ).toEqual([OverwriteType.Role, OverwriteType.Member]);
  });

  test("GIVEN delete THEN the overwrite leaves the cache", async () => {
    const client = createClient();
    await seedGuild(client, [overwrite(roleId, OverwriteType.Role, ManageMessages)]);
    vi.spyOn(container.rest, "delete").mockResolvedValue(undefined);
    const channel = (await client.channels.get(channelId)) as TextChannel;

    await channel.permissionOverwrites.delete(roleId);

    const cached = (await client.channels.get(channelId)) as TextChannel;
    expect(cached.permissionOverwrites.cache).toEqual([]);
  });
});

describe("channel editing", () => {
  test("GIVEN setters THEN they PATCH the channel and patch the structure", async () => {
    const client = createClient();
    await seedGuild(client);
    const patch = vi
      .spyOn(container.rest, "patch")
      .mockResolvedValue(textChannel({ topic: "Howling", rate_limit_per_user: 5 }));
    const channel = (await client.channels.get(channelId)) as TextChannel;

    await channel.setTopic("Howling");
    await channel.setRateLimitPerUser(5, "calm");

    expect(patch).toHaveBeenNthCalledWith(1, Routes.channel(channelId), {
      body: { topic: "Howling" },
      reason: undefined,
    });
    expect(patch).toHaveBeenNthCalledWith(2, Routes.channel(channelId), {
      body: { rate_limit_per_user: 5 },
      reason: "calm",
    });
    expect(channel.topic).toBe("Howling");
    expect(channel.rateLimitPerUser).toBe(5);
  });

  test("GIVEN setParent THEN the category's overwrites are copied by default", async () => {
    const client = createClient();
    await seedGuild(client);
    const categoryOverwrites = [overwrite(guildId, OverwriteType.Role, 0n, ViewChannel)];
    await client.cache!.channels.set(categoryId, {
      id: categoryId,
      type: ChannelType.GuildCategory,
      name: "Den",
      guild_id: guildId,
      permission_overwrites: categoryOverwrites,
    } as never);
    const patch = vi
      .spyOn(container.rest, "patch")
      .mockResolvedValue(textChannel({ parent_id: categoryId }));
    const channel = (await client.channels.get(channelId)) as TextChannel;

    await channel.setParent(categoryId);

    expect(patch).toHaveBeenCalledWith(Routes.channel(channelId), {
      body: { parent_id: categoryId, permission_overwrites: categoryOverwrites },
      reason: undefined,
    });
    expect(channel.parentId).toBe(categoryId);
  });

  test("GIVEN lockPermissions with explicit overwrites THEN edit rejects the call", async () => {
    const client = createClient();
    const patch = vi.spyOn(container.rest, "patch");

    await expect(
      client.channels.edit(channelId, { lockPermissions: true, permissionOverwrites: [] }),
    ).rejects.toThrow(TypeError);
    expect(patch).not.toHaveBeenCalled();
  });

  test("GIVEN delete THEN the channel and its messages leave the cache", async () => {
    const client = createClient();
    await seedGuild(client);
    await client.cache!.messages.set(messageKey(channelId, "1"), { id: "1" } as never);
    vi.spyOn(container.rest, "delete").mockResolvedValue(textChannel());
    const channel = (await client.channels.get(channelId)) as TextChannel;

    await channel.delete("cleanup");

    expect(await client.cache!.channels.get(channelId)).toBeUndefined();
    expect(await client.cache!.messages.get(messageKey(channelId, "1"))).toBeUndefined();
  });

  test("GIVEN guild.channels THEN it creates and moves channels", async () => {
    const client = createClient();
    const post = vi.spyOn(container.rest, "post").mockResolvedValue(textChannel());
    const patch = vi.spyOn(container.rest, "patch").mockResolvedValue(undefined);
    vi.spyOn(container.rest, "get").mockResolvedValue([textChannel({ position: 3 })]);
    const channels = client.guilds.channels(guildId);

    const created = await channels.create({ name: "general", type: ChannelType.GuildText });
    await channels.setPositions([{ channel: created, position: 3 }]);

    expect(post).toHaveBeenCalledWith(Routes.guildChannels(guildId), {
      body: { name: "general", type: ChannelType.GuildText },
      reason: undefined,
    });
    expect(patch).toHaveBeenCalledWith(Routes.guildChannels(guildId), {
      body: [{ id: channelId, position: 3 }],
      reason: undefined,
    });
    expect(((await client.channels.get(channelId)) as TextChannel).position).toBe(3);
  });
});
