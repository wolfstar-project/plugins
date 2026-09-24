import { WebSocketShardEvents } from "@discordjs/ws";
import { container } from "@wolfstar/http-framework";
import { createInMemoryCache } from "@wolfstar/plugin-cache";
import {
  ActivityType,
  ChannelType,
  GatewayDispatchEvents,
  GatewayOpcodes,
  PermissionFlagsBits,
  PresenceUpdateStatus,
  Routes,
  UserFlags,
  type APIGuildMember,
  type APIRole,
  type APIUser,
  type GatewayDispatchPayload,
} from "discord-api-types/v10";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  ClientUser,
  DMChannel,
  GatewayClient,
  GuildMember,
  Message,
  PermissionsBitField,
  Role,
  User,
} from "../src/index.js";

const botId = "266624760782258186";
const guildId = "10";
const ownerId = "500";
const userId = "600";

const bot: APIUser = {
  id: botId,
  username: "bot",
  discriminator: "0",
  global_name: null,
  avatar: null,
  bot: true,
};
const user: APIUser = {
  id: userId,
  username: "wolf",
  discriminator: "0",
  global_name: "Wolf",
  avatar: null,
  public_flags: UserFlags.Staff,
};

function role(
  id: string,
  position: number,
  permissions: bigint,
  extra: Partial<APIRole> = {},
): APIRole {
  return {
    id,
    name: `role ${id}`,
    color: 0,
    colors: { primary_color: 0, secondary_color: null, tertiary_color: null },
    hoist: false,
    position,
    permissions: String(permissions),
    managed: false,
    mentionable: false,
    flags: 0,
    ...extra,
  };
}

function member(u: APIUser, roles: string[], extra: Partial<APIGuildMember> = {}): APIGuildMember {
  return {
    user: u,
    roles,
    joined_at: "2024-01-01T00:00:00.000Z",
    deaf: false,
    mute: false,
    flags: 0,
    ...extra,
  };
}

function createClient() {
  return new GatewayClient({
    discordPublicKey: "0".repeat(64),
    discordToken: "test-token",
    clientId: botId,
    intents: 0,
    shardCount: 1,
    cache: createInMemoryCache(),
  });
}

/**
 * A guild owned by someone else, where the bot has a moderator role (position 2) above the user's (position 1).
 */
async function seedGuild(client: GatewayClient, botPermissions = PermissionFlagsBits.KickMembers) {
  const cache = client.cache!;
  await cache.guilds.set(guildId, { id: guildId, name: "Pack", owner_id: ownerId } as never);
  for (const [id, position, permissions] of [
    [guildId, 0, PermissionFlagsBits.ViewChannel],
    ["20", 2, botPermissions],
    ["21", 1, PermissionFlagsBits.SendMessages],
  ] as const) {
    await cache.roles.set(`${guildId}:${id}`, {
      ...role(id, position, permissions),
      guild_id: guildId,
    });
  }
  await cache.members.set(`${guildId}:${botId}`, { ...member(bot, ["20"]), guild_id: guildId });
  await cache.members.set(`${guildId}:${userId}`, { ...member(user, ["21"]), guild_id: guildId });
}

async function dispatch(client: GatewayClient, t: GatewayDispatchEvents, d: unknown) {
  const payload = { op: GatewayOpcodes.Dispatch, s: 1, t, d } as GatewayDispatchPayload;
  client.gateway.emit(WebSocketShardEvents.Dispatch, payload, 0);
  await client.idle();
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("User", () => {
  test("GIVEN a payload THEN every field is exposed", () => {
    const structure = new User({
      ...user,
      discriminator: "1234",
      accent_color: 0xff_00_ff,
      banner: "a_banner",
      avatar_decoration_data: { asset: "deco", sku_id: "1" },
      primary_guild: {
        identity_guild_id: "77",
        identity_enabled: true,
        tag: "WOLF",
        badge: "badge",
      },
    });

    expect(structure.tag).toBe("wolf#1234");
    expect(structure.hexAccentColor).toBe("#ff00ff");
    expect(structure.flags.has("Staff")).toBe(true);
    expect(structure.bannerURL()).toBe(`https://cdn.discordapp.com/banners/${userId}/a_banner.gif`);
    expect(structure.avatarDecorationURL()).toBe(
      "https://cdn.discordapp.com/avatar-decoration-presets/deco.png",
    );
    expect(structure.guildTagBadgeURL()).toContain("/guild-tag-badges/77/badge");
    expect(structure.defaultAvatarURL).toMatch(/embed\/avatars\/\d\.png$/);
  });

  test("GIVEN an unfetched user THEN banner fields are undefined rather than null", () => {
    const structure = new User(user);

    expect(structure.banner).toBeUndefined();
    expect(structure.bannerURL()).toBeUndefined();
    expect(structure.hexAccentColor).toBeUndefined();
    expect(new User({ ...user, banner: null }).bannerURL()).toBeNull();
  });

  test("GIVEN two users THEN equals compares their data", () => {
    expect(new User(user).equals(new User({ ...user }))).toBe(true);
    expect(new User(user).equals(new User({ ...user, username: "renamed" }))).toBe(false);
  });
});

describe("UserManager", () => {
  test("GIVEN createDM THEN the DM channel is opened, cached, and typed", async () => {
    const client = createClient();
    const post = vi
      .spyOn(container.rest, "post")
      .mockResolvedValue({ id: "90", type: ChannelType.DM, recipients: [user] });

    const channel = await client.users.createDM(userId);

    expect(post).toHaveBeenCalledWith(Routes.userChannels(), { body: { recipient_id: userId } });
    expect(channel).toBeInstanceOf(DMChannel);
    expect(await client.cache!.channels.has("90")).toBe(true);
  });

  test("GIVEN send THEN the message goes to the user's DM channel", async () => {
    // The structures reach the client through the container, where constructing it registers it.
    createClient();
    const post = vi
      .spyOn(container.rest, "post")
      .mockResolvedValueOnce({ id: "90", type: ChannelType.DM, recipients: [user] })
      .mockResolvedValueOnce({
        id: "91",
        channel_id: "90",
        content: "hi",
        author: bot,
        mentions: [],
        mention_roles: [],
      });

    const message = await new User(user).send("hi");

    expect(post).toHaveBeenLastCalledWith(Routes.channelMessages("90"), {
      body: { content: "hi" },
      files: undefined,
    });
    expect(message).toBeInstanceOf(Message);
  });
});

describe("ClientUser", () => {
  test("GIVEN READY THEN client.user is a ClientUser", async () => {
    const client = createClient();

    await dispatch(client, GatewayDispatchEvents.Ready, {
      user: { ...bot, mfa_enabled: true, verified: true },
      guilds: [],
      session_id: "s",
    });

    expect(client.user).toBeInstanceOf(ClientUser);
    expect(client.user?.mfaEnabled).toBe(true);
    expect(client.user?.verified).toBe(true);
  });

  test("GIVEN setActivity THEN a presence update is sent on every shard", async () => {
    const client = createClient();
    vi.spyOn(client.gateway, "getShardIds").mockResolvedValue([0, 1]);
    const send = vi.spyOn(client.gateway, "send").mockResolvedValue();
    const me = new ClientUser(bot);

    await me.setActivity("with wolves", { type: ActivityType.Competing });
    const presence = await me.setStatus(PresenceUpdateStatus.Idle, 1);

    expect(send).toHaveBeenCalledTimes(3);
    expect(send).toHaveBeenNthCalledWith(1, 0, {
      op: GatewayOpcodes.PresenceUpdate,
      d: expect.objectContaining({
        activities: [{ name: "with wolves", type: ActivityType.Competing }],
      }),
    });
    expect(send).toHaveBeenLastCalledWith(1, expect.anything());
    expect(presence.status).toBe(PresenceUpdateStatus.Idle);
    expect(presence.activities).toHaveLength(1);
  });

  test("GIVEN edit THEN the profile is patched and cached", async () => {
    const client = createClient();
    const patch = vi
      .spyOn(container.rest, "patch")
      .mockResolvedValue({ ...bot, username: "renamed" });
    const me = new ClientUser(bot);

    await me.setUsername("renamed");

    expect(patch).toHaveBeenCalledWith(Routes.user("@me"), { body: { username: "renamed" } });
    expect(me.username).toBe("renamed");
    expect((await client.users.get(botId))?.username).toBe("renamed");
  });
});

describe("Role", () => {
  test("GIVEN a payload THEN permissions, colors, and mention are exposed", () => {
    const structure = new Role({
      ...role("21", 1, PermissionFlagsBits.SendMessages, {
        colors: { primary_color: 0x12_34_56, secondary_color: 0xab_cd_ef, tertiary_color: null },
      }),
      guild_id: guildId,
    });

    expect(structure.permissions).toBeInstanceOf(PermissionsBitField);
    expect(structure.permissions.has("SendMessages")).toBe(true);
    expect(structure.hexColor).toBe("#123456");
    expect(structure.colors.secondaryColor).toBe(0xab_cd_ef);
    expect(`${structure}`).toBe("<@&21>");
    expect(`${new Role({ ...role(guildId, 0, 0n), guild_id: guildId })}`).toBe("@everyone");
  });

  test("GIVEN equal positions THEN the older role ranks higher", () => {
    const older = new Role({ ...role("100", 1, 0n), guild_id: guildId });
    const newer = new Role({ ...role("200", 1, 0n), guild_id: guildId });

    expect(older.comparePositionTo(newer)).toBeGreaterThan(0);
    expect(newer.comparePositionTo(older)).toBeLessThan(0);
  });

  test("GIVEN edit THEN the REST body is built and the cache updated", async () => {
    const client = createClient();
    await seedGuild(client);
    const patch = vi
      .spyOn(container.rest, "patch")
      .mockResolvedValue(role("21", 1, PermissionFlagsBits.Administrator, { name: "admin" }));
    const structure = (await client.roles.get(guildId, "21"))!;

    await structure.edit({ name: "admin", permissions: ["Administrator"], reason: "promotion" });

    expect(patch).toHaveBeenCalledWith(Routes.guildRole(guildId, "21"), {
      body: expect.objectContaining({
        name: "admin",
        permissions: String(PermissionFlagsBits.Administrator),
      }),
      reason: "promotion",
    });
    expect(structure.name).toBe("admin");
    expect((await client.roles.get(guildId, "21"))?.name).toBe("admin");
  });

  test("GIVEN fetchAll THEN the roles are cached and sorted highest first", async () => {
    const client = createClient();
    vi.spyOn(container.rest, "get").mockResolvedValue([
      role(guildId, 0, 0n),
      role("21", 1, 0n),
      role("20", 2, 0n),
    ]);

    const roles = await client.roles.fetchAll(guildId);

    expect(roles.map((structure) => structure.id)).toEqual(["20", "21", guildId]);
    expect(await client.roles.get(guildId, "21")).toBeDefined();
  });

  test("GIVEN delete THEN the role leaves the cache", async () => {
    const client = createClient();
    await seedGuild(client);
    vi.spyOn(container.rest, "delete").mockResolvedValue(undefined);

    await (await client.roles.get(guildId, "21"))!.delete("cleanup");

    expect(await client.roles.get(guildId, "21")).toBeUndefined();
  });
});

describe("GuildMember", () => {
  test("GIVEN a payload THEN timestamps, flags, and timeout state are exposed", () => {
    const structure = new GuildMember({
      ...member(user, ["21"], {
        premium_since: "2024-02-01T00:00:00.000Z",
        communication_disabled_until: new Date(Date.now() + 60_000).toISOString(),
        flags: 1,
      }),
      guild_id: guildId,
    });

    expect(structure.premiumSince?.toISOString()).toBe("2024-02-01T00:00:00.000Z");
    expect(structure.isCommunicationDisabled()).toBe(true);
    expect(structure.flags.has("DidRejoin")).toBe(true);
    expect(structure.roles.ids).toEqual(["21"]);
  });

  test("GIVEN the cache THEN permissions combine @everyone and the member's roles", async () => {
    const client = createClient();
    await seedGuild(client);

    const permissions = await (await client.members.get(guildId, userId))!.fetchPermissions();

    expect(permissions.has("ViewChannel")).toBe(true);
    expect(permissions.has("SendMessages")).toBe(true);
    expect(permissions.has("KickMembers")).toBe(false);
  });

  test("GIVEN the owner or an administrator THEN every permission is granted", async () => {
    const client = createClient();
    await seedGuild(client, PermissionFlagsBits.Administrator);
    await client.cache!.members.set(`${guildId}:${ownerId}`, {
      ...member({ ...user, id: ownerId }, []),
      guild_id: guildId,
    });

    const admin = await (await client.members.get(guildId, botId))!.fetchPermissions();
    const owner = await (await client.members.get(guildId, ownerId))!.fetchPermissions();

    expect(admin.bitField).toBe(PermissionsBitField.All);
    expect(owner.bitField).toBe(PermissionsBitField.All);
  });

  test("GIVEN the role hierarchy THEN the bot can kick a lower member, but not the owner", async () => {
    const client = createClient();
    await seedGuild(client);
    await client.cache!.members.set(`${guildId}:${ownerId}`, {
      ...member({ ...user, id: ownerId }, []),
      guild_id: guildId,
    });

    const target = (await client.members.get(guildId, userId))!;
    const owner = (await client.members.get(guildId, ownerId))!;

    expect(await target.fetchKickable()).toBe(true);
    expect(await target.fetchBannable()).toBe(false);
    expect(await owner.fetchManageable()).toBe(false);
  });

  test("GIVEN timeout THEN the end time is sent as an ISO timestamp", async () => {
    const client = createClient();
    await seedGuild(client);
    vi.useFakeTimers({ now: Date.parse("2024-06-01T00:00:00.000Z") });
    const patch = vi.spyOn(container.rest, "patch").mockResolvedValue(member(user, ["21"]));

    await (await client.members.get(guildId, userId))!.timeout(60_000, "spam");
    vi.useRealTimers();

    expect(patch).toHaveBeenCalledWith(Routes.guildMember(guildId, userId), {
      body: expect.objectContaining({ communication_disabled_until: "2024-06-01T00:01:00.000Z" }),
      reason: "spam",
    });
  });

  test("GIVEN roles.add with one role THEN it is added through its endpoint and the cache patched", async () => {
    const client = createClient();
    await seedGuild(client);
    const put = vi.spyOn(container.rest, "put").mockResolvedValue(undefined);

    await (await client.members.get(guildId, userId))!.roles.add("20");

    expect(put).toHaveBeenCalledWith(Routes.guildMemberRole(guildId, userId, "20"), {
      reason: undefined,
    });
    expect((await client.members.get(guildId, userId))?.roleIds).toEqual(["21", "20"]);
  });

  test("GIVEN roles.remove with several roles THEN the member's roles are replaced", async () => {
    const client = createClient();
    await seedGuild(client);
    const patch = vi.spyOn(container.rest, "patch").mockResolvedValue(member(user, []));

    await (await client.members.get(guildId, userId))!.roles.remove(["21"]);

    expect(patch).toHaveBeenCalledWith(Routes.guildMember(guildId, userId), {
      body: expect.objectContaining({ roles: [] }),
      reason: undefined,
    });
  });

  test("GIVEN kick THEN the member leaves the cache", async () => {
    const client = createClient();
    await seedGuild(client);
    vi.spyOn(container.rest, "delete").mockResolvedValue(undefined);

    await (await client.members.get(guildId, userId))!.kick("bye");

    expect(await client.members.get(guildId, userId)).toBeUndefined();
  });
});

describe("GuildMemberManager", () => {
  test("GIVEN list and search THEN the query is built and results cached", async () => {
    const client = createClient();
    const get = vi.spyOn(container.rest, "get").mockResolvedValue([member(user, [])]);

    await client.members.list(guildId, { limit: 50, after: "1" });
    const found = await client.members.search(guildId, { query: "wo" });

    expect(get.mock.calls[0]![0]).toBe(Routes.guildMembers(guildId));
    expect(String((get.mock.calls[0]![1] as { query: URLSearchParams }).query)).toBe(
      "limit=50&after=1",
    );
    expect(String((get.mock.calls[1]![1] as { query: URLSearchParams }).query)).toBe(
      "query=wo&limit=1",
    );
    expect(found[0]?.displayName).toBe("Wolf");
    expect(await client.members.get(guildId, userId)).toBeDefined();
  });

  test("GIVEN bulkBan THEN banned users leave the cache and failures are reported", async () => {
    const client = createClient();
    await seedGuild(client);
    vi.spyOn(container.rest, "post").mockResolvedValue({
      banned_users: [userId],
      failed_users: ["7"],
    });

    const result = await client.members.bulkBan(guildId, [userId, "7"], {
      deleteMessageSeconds: 60,
    });

    expect(result).toEqual({ bannedUsers: [userId], failedUsers: ["7"] });
    expect(await client.members.get(guildId, userId)).toBeUndefined();
  });
});
