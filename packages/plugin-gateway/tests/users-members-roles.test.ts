import { WebSocketShardEvents } from "@discordjs/ws";
import { container } from "@wolfstar/http-framework";
import { Collection } from "@discordjs/collection";
import { createInMemoryCache, MemoryEntityCache, type EntityCache } from "@wolfstar/plugin-cache";
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
  GatewayErrorCodes,
  GuildMember,
  Message,
  PermissionsBitField,
  Role,
  ThreadMember,
  User,
  type GatewayClientOptions,
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

function createClient(options: Partial<GatewayClientOptions> = {}) {
  return new GatewayClient({
    discordPublicKey: "0".repeat(64),
    discordToken: "test-token",
    clientId: botId,
    intents: 0,
    shardCount: 1,
    cache: createInMemoryCache(),
    ...options,
  });
}

// The default cache of structure instances, `CollectionCache`.
function createCollectionClient() {
  return createClient({ cache: undefined });
}

// A store answering with promises, like Redis.
function asynchronousStore(): EntityCache<any> {
  const inner = new MemoryEntityCache<any>();
  return {
    get: async (key) => inner.get(key),
    set: async (key, value, options) => inner.set(key, value, options),
    upsert: async (key, data, options) => inner.upsert(key, data, options),
    has: async (key) => inner.has(key),
    delete: async (key) => inner.delete(key),
    clear: async () => inner.clear(),
    getSize: async () => inner.getSize(),
  };
}

function createAsynchronousClient() {
  return createClient({ cache: undefined, makeCache: () => asynchronousStore() });
}

const dm = { id: "90", type: ChannelType.DM, recipients: [user], last_message_id: null };

async function cachedMember(client: GatewayClient, id = userId) {
  return (await client.members.cache.get(client.members.resolveKey(guildId, id)))!;
}

async function cachedRole(client: GatewayClient, id: string) {
  return (await client.roles.cache.get(client.roles.resolveKey(guildId, id)))!;
}

async function seedRole(client: GatewayClient, data: APIRole) {
  await client.cache!.roles!.set(`${guildId}:${data.id}`, { ...data, guild_id: guildId });
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
    expect((await client.users.cache.get(botId))?.username).toBe("renamed");
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
    const structure = (await client.roles.cache.get(client.roles.resolveKey(guildId, "21")))!;

    await structure.edit({ name: "admin", permissions: ["Administrator"], reason: "promotion" });

    expect(patch).toHaveBeenCalledWith(Routes.guildRole(guildId, "21"), {
      body: expect.objectContaining({
        name: "admin",
        permissions: String(PermissionFlagsBits.Administrator),
      }),
      reason: "promotion",
    });
    expect(structure.name).toBe("admin");
    expect((await client.roles.cache.get(client.roles.resolveKey(guildId, "21")))?.name).toBe(
      "admin",
    );
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
    expect(await client.roles.cache.get(client.roles.resolveKey(guildId, "21"))).toBeDefined();
  });

  test("GIVEN setPosition THEN the role is moved among the sorted roles and takes the position Discord applied", async () => {
    const client = createClient();
    await seedGuild(client);
    vi.spyOn(container.rest, "get").mockResolvedValue([
      role(guildId, 0, 0n),
      role("21", 1, 0n),
      role("20", 2, 0n),
    ]);
    // Discord answers with positions of its own, which win over the requested indexes.
    const patch = vi
      .spyOn(container.rest, "patch")
      .mockResolvedValue([role(guildId, 0, 0n), role("20", 2, 0n), role("21", 3, 0n)]);
    const structure = (await client.roles.cache.get(client.roles.resolveKey(guildId, "21")))!;

    await structure.setPosition(1, { relative: true, reason: "promotion" });

    expect(patch).toHaveBeenCalledWith(Routes.guildRoles(guildId), {
      body: [
        { id: guildId, position: 0 },
        { id: "20", position: 1 },
        { id: "21", position: 2 },
      ],
      reason: "promotion",
    });
    expect(structure.position).toBe(3);
    expect((await client.roles.cache.get(client.roles.resolveKey(guildId, "21")))?.position).toBe(
      3,
    );
  });

  test("GIVEN setPosition out of range THEN the roles keep their order", async () => {
    const client = createClient();
    vi.spyOn(container.rest, "get").mockResolvedValue([role(guildId, 0, 0n), role("21", 1, 0n)]);
    const patch = vi
      .spyOn(container.rest, "patch")
      .mockResolvedValue([role(guildId, 0, 0n), role("21", 1, 0n)]);

    await client.roles.setPosition(guildId, "21", 99, "cleanup");

    expect(patch).toHaveBeenCalledWith(Routes.guildRoles(guildId), {
      body: [
        { id: guildId, position: 0 },
        { id: "21", position: 1 },
      ],
      reason: "cleanup",
    });
  });

  test("GIVEN setPosition for a role of another guild THEN it throws", async () => {
    const client = createClient();
    vi.spyOn(container.rest, "get").mockResolvedValue([role(guildId, 0, 0n)]);

    await expect(client.roles.setPosition(guildId, "99", 0)).rejects.toThrow(/not a role of guild/);
  });

  test("GIVEN delete THEN the role leaves the cache", async () => {
    const client = createClient();
    await seedGuild(client);
    vi.spyOn(container.rest, "delete").mockResolvedValue(undefined);

    await (await client.roles.cache.get(client.roles.resolveKey(guildId, "21")))!.delete("cleanup");

    expect(await client.roles.cache.get(client.roles.resolveKey(guildId, "21"))).toBeUndefined();
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

    const permissions = await (await client.members.cache.get(
      client.members.resolveKey(guildId, userId),
    ))!.fetchPermissions();

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

    const admin = await (await client.members.cache.get(
      client.members.resolveKey(guildId, botId),
    ))!.fetchPermissions();
    const owner = await (await client.members.cache.get(
      client.members.resolveKey(guildId, ownerId),
    ))!.fetchPermissions();

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

    const target = (await client.members.cache.get(client.members.resolveKey(guildId, userId)))!;
    const owner = (await client.members.cache.get(client.members.resolveKey(guildId, ownerId)))!;

    expect(await target.fetchKickable()).toBe(true);
    expect(await target.fetchBannable()).toBe(false);
    expect(await owner.fetchManageable()).toBe(false);
  });

  test("GIVEN timeout THEN the end time is sent as an ISO timestamp", async () => {
    const client = createClient();
    await seedGuild(client);
    vi.useFakeTimers({ now: Date.parse("2024-06-01T00:00:00.000Z") });
    const patch = vi.spyOn(container.rest, "patch").mockResolvedValue(member(user, ["21"]));

    await (await client.members.cache.get(client.members.resolveKey(guildId, userId)))!.timeout(
      60_000,
      "spam",
    );
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

    await (await client.members.cache.get(client.members.resolveKey(guildId, userId)))!.roles.add(
      "20",
    );

    expect(put).toHaveBeenCalledWith(Routes.guildMemberRole(guildId, userId, "20"), {
      reason: undefined,
    });
    expect(
      (await client.members.cache.get(client.members.resolveKey(guildId, userId)))?.roleIds,
    ).toEqual(["21", "20"]);
  });

  test("GIVEN roles.remove with several roles THEN the member's roles are replaced", async () => {
    const client = createClient();
    await seedGuild(client);
    const patch = vi.spyOn(container.rest, "patch").mockResolvedValue(member(user, []));

    await (await client.members.cache.get(
      client.members.resolveKey(guildId, userId),
    ))!.roles.remove(["21"]);

    expect(patch).toHaveBeenCalledWith(Routes.guildMember(guildId, userId), {
      body: expect.objectContaining({ roles: [] }),
      reason: undefined,
    });
  });

  test("GIVEN kick THEN the member leaves the cache", async () => {
    const client = createClient();
    await seedGuild(client);
    vi.spyOn(container.rest, "delete").mockResolvedValue(undefined);

    await (await client.members.cache.get(client.members.resolveKey(guildId, userId)))!.kick("bye");

    expect(
      await client.members.cache.get(client.members.resolveKey(guildId, userId)),
    ).toBeUndefined();
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
    expect(
      await client.members.cache.get(client.members.resolveKey(guildId, userId)),
    ).toBeDefined();
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
    expect(
      await client.members.cache.get(client.members.resolveKey(guildId, userId)),
    ).toBeUndefined();
  });
});

describe("GuildMemberRoleManager", () => {
  test("GIVEN the default cache THEN cache is a synchronous Collection with @everyone, skipping uncached roles", async () => {
    const client = createCollectionClient();
    await seedGuild(client);
    await client.cache!.members.set(`${guildId}:${userId}`, {
      ...member(user, ["21", "99"]),
      guild_id: guildId,
    });
    const target = await cachedMember(client);

    const { roles } = target;
    const cache = roles.cache as Collection<string, Role>;

    expect(cache).toBeInstanceOf(Collection);
    expect([...cache.keys()]).toEqual(["21", guildId]);
    expect(cache.first()).toBeInstanceOf(Role);
    expect(roles.member).toBe(target);
    expect(roles.guild?.id).toBe(guildId);
    expect(roles.ids).toEqual(["21", "99"]);
    expect(roles.clone().member).toBe(target);
  });

  test("GIVEN cached roles THEN the getters pick among them, highest first", async () => {
    const client = createCollectionClient();
    await seedGuild(client);
    await seedRole(client, role("30", 3, 0n, { hoist: true, icon: "icon" }));
    await seedRole(
      client,
      role("31", 4, 0n, {
        colors: { primary_color: 0xff_00_00, secondary_color: null, tertiary_color: null },
        tags: { premium_subscriber: null },
      }),
    );
    await seedRole(client, role("20", 2, 0n, { tags: { bot_id: botId } }));
    await client.cache!.members.set(`${guildId}:${userId}`, {
      ...member(user, ["21", "30", "31"]),
      guild_id: guildId,
    });
    const { roles } = await cachedMember(client);

    expect((roles.highest as Role).id).toBe("31");
    expect((roles.hoist as Role).id).toBe("30");
    expect((roles.color as Role).id).toBe("31");
    expect((roles.icon as Role).id).toBe("30");
    expect((roles.premiumSubscriberRole as Role).id).toBe("31");
    expect(roles.botRole).toBeNull();
    expect(((await cachedMember(client, botId)).roles.botRole as Role).id).toBe("20");
    expect((await roles.fetchColor())?.id).toBe("31");
  });

  test("GIVEN no colored, hoisted, or boosting role THEN the getters are null", async () => {
    const client = createCollectionClient();
    await seedGuild(client);
    const { roles } = await cachedMember(client);

    expect((roles.highest as Role).id).toBe("21");
    expect(roles.hoist).toBeNull();
    expect(roles.color).toBeNull();
    expect(roles.icon).toBeNull();
    expect(roles.premiumSubscriberRole).toBeNull();
  });

  test("GIVEN an asynchronous store THEN cache and the getters are promises", async () => {
    const client = createAsynchronousClient();
    await seedGuild(client);
    const { roles } = await cachedMember(client);

    const cache = roles.cache;
    const highest = roles.highest;

    expect(cache).toBeInstanceOf(Promise);
    expect([...(await cache).keys()]).toEqual(["21", guildId]);
    expect(highest).toBeInstanceOf(Promise);
    expect((await highest)?.id).toBe("21");
  });

  test("GIVEN no cache THEN cache is empty and highest is null", async () => {
    const client = createClient({ cache: null });
    const target = client.members.cache.construct({ ...member(user, ["21"]), guild_id: guildId });

    expect((await target.roles.cache).size).toBe(0);
    expect(await target.roles.highest).toBeNull();
  });

  test("GIVEN a member without a user THEN botRole and fetchBotRole are both null", async () => {
    const client = createCollectionClient();
    await seedGuild(client);
    const { user: _, ...userless } = member(user, ["21"]);
    const target = client.members.cache.construct({ ...userless, guild_id: guildId });

    expect(target.roles.botRole).toBeNull();
    expect(await target.roles.fetchBotRole()).toBeNull();
  });

  test("GIVEN add with a Role THEN it resolves to a copy of the member with the role", async () => {
    const client = createCollectionClient();
    await seedGuild(client);
    const put = vi.spyOn(container.rest, "put").mockResolvedValue(undefined);
    const target = await cachedMember(client);

    const updated = await target.roles.add(await cachedRole(client, "20"), "promoted");

    expect(put).toHaveBeenCalledWith(Routes.guildMemberRole(guildId, userId, "20"), {
      reason: "promoted",
    });
    expect(updated).toBeInstanceOf(GuildMember);
    expect(updated).not.toBe(target);
    expect(updated.roleIds).toEqual(["21", "20"]);
  });

  test("GIVEN add and remove without a cache THEN they still resolve to the updated member", async () => {
    const client = createClient({ cache: null });
    vi.spyOn(container.rest, "put").mockResolvedValue(undefined);
    const remove = vi.spyOn(container.rest, "delete").mockResolvedValue(undefined);
    const target = client.members.cache.construct({ ...member(user, ["21"]), guild_id: guildId });

    const added = await target.roles.add("20");
    const removed = await target.roles.remove("21");

    expect(added.roleIds).toEqual(["21", "20"]);
    expect(removed.roleIds).toEqual([]);
    expect(target.roleIds).toEqual(["21"]);
    expect(remove).toHaveBeenCalledWith(Routes.guildMemberRole(guildId, userId, "21"), {
      reason: undefined,
    });
  });

  test("GIVEN add with a Collection THEN the member is edited with the union of its roles", async () => {
    const client = createCollectionClient();
    await seedGuild(client);
    const patch = vi.spyOn(container.rest, "patch").mockResolvedValue(member(user, ["21", "20"]));
    const target = await cachedMember(client);
    const moderator = await cachedRole(client, "20");

    const updated = await target.roles.add(new Collection([["20", moderator]]), "promoted");

    expect(patch).toHaveBeenCalledWith(Routes.guildMember(guildId, userId), {
      body: expect.objectContaining({ roles: ["21", "20"] }),
      reason: "promoted",
    });
    expect(updated).toBeInstanceOf(GuildMember);
    expect(updated.roleIds).toEqual(["21", "20"]);
  });

  test("GIVEN set and edit with Roles THEN their IDs are sent", async () => {
    const client = createCollectionClient();
    await seedGuild(client);
    const patch = vi.spyOn(container.rest, "patch").mockResolvedValue(member(user, ["20"]));
    const target = await cachedMember(client);
    const moderator = await cachedRole(client, "20");

    await target.roles.set([moderator]);
    await target.edit({ roles: new Collection([["20", moderator]]) });

    expect(patch).toHaveBeenCalledTimes(2);
    for (const call of patch.mock.calls) {
      expect((call[1] as { body: { roles: string[] } }).body.roles).toEqual(["20"]);
    }
  });

  test("GIVEN an invalid resolvable THEN InvalidType or InvalidElement is thrown", async () => {
    const client = createCollectionClient();
    await seedGuild(client);
    const { roles } = await cachedMember(client);

    await expect(roles.add(42 as never)).rejects.toMatchObject({
      code: GatewayErrorCodes.InvalidType,
      message:
        "Supplied roles is not a Role, Snowflake or Array or Collection of Roles or Snowflakes.",
    });
    await expect(roles.remove(null as never)).rejects.toMatchObject({
      code: GatewayErrorCodes.InvalidType,
    });
    await expect(roles.add(["20", 42 as never])).rejects.toMatchObject({
      code: GatewayErrorCodes.InvalidElement,
      message: "Supplied Array or Collection roles includes an invalid element: 42",
    });
    await expect(roles.set([{} as never])).rejects.toBeInstanceOf(TypeError);
  });
});

describe("GuildEmojiRoleManager", () => {
  const emoji = { id: "42", name: "howl", roles: ["21", "99"], guild_id: guildId };

  test("GIVEN the default cache THEN cache is a Collection of the cached allowed roles", async () => {
    const client = createCollectionClient();
    await seedGuild(client);
    const structure = await client.guilds.emojis(guildId)._add(emoji);

    const { roles } = structure;
    const cache = roles.cache as Collection<string, Role>;

    expect(cache).toBeInstanceOf(Collection);
    expect([...cache.keys()]).toEqual(["21"]);
    expect(roles.emoji).toBe(structure);
    expect(roles.guild?.id).toBe(guildId);
    expect(roles.clone().emoji).toBe(structure);
  });

  test("GIVEN add, remove, and set with Roles and Collections THEN the emoji is edited with their IDs", async () => {
    const client = createCollectionClient();
    await seedGuild(client);
    const patch = vi.spyOn(container.rest, "patch").mockImplementation(async (_route, options) => ({
      ...emoji,
      roles: (options!.body as { roles: string[] }).roles,
    }));
    const moderator = await cachedRole(client, "20");
    const structure = await client.guilds.emojis(guildId)._add(emoji);

    expect((await structure.roles.add(moderator)).roleIds).toEqual(["21", "99", "20"]);
    expect((await structure.roles.remove(new Collection([["20", moderator]]))).roleIds).toEqual([
      "21",
      "99",
    ]);
    expect((await structure.roles.set([moderator, "21"])).roleIds).toEqual(["20", "21"]);
    expect(patch).toHaveBeenCalledTimes(3);
    await expect(structure.roles.add(42 as never)).rejects.toMatchObject({
      code: GatewayErrorCodes.InvalidElement,
    });
  });
});

describe("UserManager direct messages", () => {
  test("GIVEN a cached DM THEN createDM reuses it unless forced", async () => {
    const client = createCollectionClient();
    const post = vi.spyOn(container.rest, "post").mockResolvedValue(dm);

    const first = await client.users.createDM(userId);
    const second = await client.users.createDM(new User(user));
    await new User(user).createDM(true);

    expect(second).toBe(first);
    expect(post).toHaveBeenCalledTimes(2);
  });

  test("GIVEN cache: false THEN the DM is not stored", async () => {
    const client = createCollectionClient();
    vi.spyOn(container.rest, "post").mockResolvedValue(dm);

    const channel = await client.users.createDM(userId, { cache: false });

    expect(channel).toBeInstanceOf(DMChannel);
    expect(client.users.dmChannel(userId)).toBeNull();
  });

  test("GIVEN dmChannel THEN it is the cached DM with the user, null without one", async () => {
    const client = createCollectionClient();
    vi.spyOn(container.rest, "post").mockResolvedValue(dm);

    expect(client.users.dmChannel(userId)).toBeNull();
    const channel = await client.users.createDM(userId);

    expect(client.users.dmChannel(userId)).toBe(channel);
    expect(new User(user).dmChannel).toBe(channel);
    expect(client.users.dmChannel(botId)).toBeNull();
  });

  test("GIVEN a raw in-memory store THEN the cached DM is found too", async () => {
    const client = createClient();
    const post = vi.spyOn(container.rest, "post").mockResolvedValue(dm);

    await client.users.createDM(userId);
    const channel = await client.users.createDM(userId);

    expect(channel.id).toBe("90");
    expect(post).toHaveBeenCalledOnce();
  });

  test("GIVEN deleteDM THEN the cached DM is closed, and it throws without one", async () => {
    const client = createCollectionClient();
    const post = vi.spyOn(container.rest, "post").mockResolvedValue(dm);
    const remove = vi.spyOn(container.rest, "delete").mockResolvedValue(dm);

    await expect(client.users.deleteDM(userId)).rejects.toMatchObject({
      code: GatewayErrorCodes.UserNoDMChannel,
    });
    expect(post).not.toHaveBeenCalled();

    await client.users.createDM(userId);
    const closed = await new User(user).deleteDM();

    expect(closed.id).toBe("90");
    expect(post).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith(Routes.channel("90"), expect.anything());
    expect(client.users.dmChannel(userId)).toBeNull();
  });

  test.each([
    ["no cache", () => createClient({ cache: null })],
    ["an asynchronous store", createAsynchronousClient],
  ])(
    "GIVEN %s THEN createDM and deleteDM ask the API, as the DM cannot be searched",
    async (_, create) => {
      const client = create();
      const post = vi.spyOn(container.rest, "post").mockResolvedValue(dm);
      const remove = vi.spyOn(container.rest, "delete").mockResolvedValue(dm);

      await client.users.createDM(userId);
      await client.users.createDM(userId);

      expect(await client.users.dmChannel(userId)).toBeNull();
      expect(post).toHaveBeenCalledTimes(2);
      expect((await client.users.deleteDM(userId)).id).toBe("90");
      expect(post).toHaveBeenCalledTimes(3);
      expect(remove).toHaveBeenCalledOnce();
    },
  );

  test("GIVEN a member, a thread member, or a message THEN they resolve to their user", async () => {
    const client = createCollectionClient();
    const get = vi.spyOn(container.rest, "get").mockResolvedValue(user);
    const post = vi.spyOn(container.rest, "post").mockResolvedValue(dm);
    const guildMember = new GuildMember({ ...member(user, []), guild_id: guildId });
    const threadMember = new ThreadMember({
      id: "70",
      user_id: userId,
      join_timestamp: "2024-01-01T00:00:00.000Z",
      flags: 0,
    });
    const message = new Message({
      id: "91",
      channel_id: "90",
      content: "hi",
      author: user,
      mentions: [],
      mention_roles: [],
    } as never);

    for (const resolvable of [guildMember, threadMember, message, new User(user), userId]) {
      expect(client.users.resolveId(resolvable)).toBe(userId);
    }

    expect((client.users.resolve(guildMember) as User).id).toBe(userId);
    expect((client.users.resolve(message) as User).id).toBe(userId);
    expect(client.users.resolve(userId)).toBeNull();
    expect((await client.users.fetch(guildMember)).id).toBe(userId);
    expect(get).toHaveBeenCalledWith(Routes.user(userId), expect.anything());
    expect((await client.users.createDM(threadMember)).id).toBe("90");
    expect(post).toHaveBeenCalledWith(Routes.userChannels(), { body: { recipient_id: userId } });
    expect(() => client.users.dmChannel(new GuildMember({ roles: [] } as never))).toThrow(
      TypeError,
    );
  });
});
