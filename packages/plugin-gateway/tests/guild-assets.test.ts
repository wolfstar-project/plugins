import { WebSocketShardEvents } from "@discordjs/ws";
import { container } from "@wolfstar/http-framework";
import { createInMemoryCache, type Cache } from "@wolfstar/plugin-cache";
import {
  ChannelType,
  GatewayDispatchEvents,
  GatewayOpcodes,
  GuildFeature,
  GuildPremiumTier,
  InviteType,
  Routes,
  StickerFormatType,
  StickerType,
  type APIEmoji,
  type APISticker,
  type APIUser,
  type GatewayDispatchPayload,
} from "discord-api-types/v10";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  AnonymousGuild,
  BaseInvite,
  createInvite,
  Emoji,
  GatewayClient,
  Guild,
  GuildEmoji,
  GuildInvite,
  GroupDMInvite,
  Sticker,
  type GatewayEventMap,
  type GatewayEventName,
} from "../src/index.js";

const guildId = "10";
const user: APIUser = {
  id: "600",
  username: "wolf",
  discriminator: "0",
  global_name: null,
  avatar: null,
};

function createClient(cache: Cache | null = createInMemoryCache()) {
  return new GatewayClient({
    discordPublicKey: "0".repeat(64),
    discordToken: "test-token",
    clientId: "266624760782258186",
    intents: 0,
    cache: cache ?? undefined,
  });
}

function guildData(extra: Record<string, unknown> = {}) {
  return {
    id: guildId,
    name: "Wolf's Den Pack",
    icon: null,
    splash: "splash",
    owner_id: "500",
    features: [GuildFeature.Partnered],
    premium_tier: GuildPremiumTier.Tier2,
    system_channel_flags: 1,
    ...extra,
  } as never;
}

function emoji(id: string, name: string, extra: Partial<APIEmoji> = {}): APIEmoji {
  return {
    id,
    name,
    roles: [],
    animated: false,
    managed: false,
    available: true,
    require_colons: true,
    ...extra,
  };
}

function sticker(id: string, extra: Partial<APISticker> = {}): APISticker {
  return {
    id,
    name: `sticker ${id}`,
    description: null,
    tags: "wolf",
    type: StickerType.Guild,
    format_type: StickerFormatType.PNG,
    ...extra,
  };
}

async function dispatch(client: GatewayClient, t: GatewayDispatchEvents, d: unknown) {
  const payload = { op: GatewayOpcodes.Dispatch, s: 1, t, d } as GatewayDispatchPayload;
  client.gateway.emit(WebSocketShardEvents.Dispatch, payload, 0);
  await client.idle();
}

function record<Event extends GatewayEventName>(client: GatewayClient, event: Event) {
  const calls: GatewayEventMap[Event][] = [];
  client.on(event, (...args: any[]) => {
    calls.push(args as GatewayEventMap[Event]);
  });
  return calls;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Guild", () => {
  test("GIVEN a payload THEN the derived fields are computed", () => {
    const guild = new Guild(guildData());

    expect(guild).toBeInstanceOf(AnonymousGuild);
    expect(guild.nameAcronym).toBe("WDP");
    expect(guild.partnered).toBe(true);
    expect(guild.verified).toBe(false);
    expect(guild.maximumBitrate).toBe(256_000);
    expect(guild.systemChannelFlags.has("SuppressJoinNotifications")).toBe(true);
    expect(guild.splashURL()).toBe(`https://cdn.discordapp.com/splashes/${guildId}/splash.webp`);
  });

  test("GIVEN edit THEN the options are mapped to the REST body and the cache is updated", async () => {
    const client = createClient();
    await client.cache!.guilds.set(guildId, guildData());
    const patch = vi
      .spyOn(container.rest, "patch")
      .mockResolvedValue(guildData({ name: "Renamed" }));
    const guild = (await client.guilds.get(guildId))!;

    await guild.edit({
      name: "Renamed",
      systemChannel: "20",
      systemChannelFlags: ["SuppressJoinNotifications"],
      reason: "rename",
    });

    expect(patch).toHaveBeenCalledWith(Routes.guild(guildId), {
      body: expect.objectContaining({
        name: "Renamed",
        system_channel_id: "20",
        system_channel_flags: 1,
      }),
      reason: "rename",
    });
    expect(guild.name).toBe("Renamed");
    expect((await client.guilds.get(guildId))?.name).toBe("Renamed");
  });

  test("GIVEN disableInvites THEN INVITES_DISABLED is added to the features, and removed again", async () => {
    const client = createClient();
    await client.cache!.guilds.set(guildId, guildData());
    const patch = vi.spyOn(container.rest, "patch").mockResolvedValue(guildData());
    const guild = (await client.guilds.get(guildId))!;

    await guild.disableInvites();

    expect(patch.mock.calls[0]![1]).toMatchObject({
      body: { features: [GuildFeature.Partnered, GuildFeature.InvitesDisabled] },
    });
  });

  test("GIVEN setIncidentActions THEN the times are sent as ISO strings and the cache is patched", async () => {
    const client = createClient();
    await client.cache!.guilds.set(guildId, guildData());
    const incidents = {
      invites_disabled_until: "2024-06-01T01:00:00.000Z",
      dms_disabled_until: null,
    };
    const put = vi.spyOn(container.rest, "put").mockResolvedValue(incidents);

    await (await client.guilds.get(guildId))!.setIncidentActions({
      invitesDisabledUntil: Date.parse("2024-06-01T01:00:00.000Z"),
      dmsDisabledUntil: null,
    });

    expect(put).toHaveBeenCalledWith(Routes.guildIncidentActions(guildId), { body: incidents });
    expect((await client.guilds.get(guildId))?.incidentsData).toEqual(incidents);
  });

  test("GIVEN leave THEN the guild and everything it scopes leave the cache", async () => {
    const client = createClient();
    await client.cache!.guilds.set(guildId, guildData());
    await client.cache!.members.set(`${guildId}:600`, {
      user,
      roles: [],
      guild_id: guildId,
    } as never);
    vi.spyOn(container.rest, "delete").mockResolvedValue(undefined);

    await (await client.guilds.get(guildId))!.leave();

    expect(await client.guilds.get(guildId)).toBeUndefined();
    expect(await client.members.get(guildId, "600")).toBeUndefined();
  });

  test("GIVEN fetchVanityData THEN the vanity code is patched in", async () => {
    const client = createClient();
    vi.spyOn(container.rest, "get").mockResolvedValue({ code: "wolves", uses: 3 });
    const guild = new Guild(guildData());

    expect(await guild.fetchVanityData()).toEqual({ code: "wolves", uses: 3 });
    expect(guild.vanityURLCode).toBe("wolves");
    expect(client.guilds).toBeDefined();
  });
});

describe("Emoji", () => {
  test("GIVEN a Unicode emoji THEN it has no ID, no image, and an encoded identifier", () => {
    const unicode = new Emoji({ id: null, name: "🐺" });

    expect(unicode.identifier).toBe(encodeURIComponent("🐺"));
    expect(unicode.imageURL()).toBeNull();
    expect(`${unicode}`).toBe("🐺");
    expect(unicode.createdAt).toBeNull();
  });

  test("GIVEN an animated custom emoji THEN its mention, identifier, and GIF URL are built", () => {
    const custom = new GuildEmoji({
      ...emoji("42", "howl", { animated: true }),
      guild_id: guildId,
    });

    expect(`${custom}`).toBe("<a:howl:42>");
    expect(custom.identifier).toBe("a:howl:42");
    expect(custom.imageURL()).toBe("https://cdn.discordapp.com/emojis/42.gif");
  });
});

describe("GuildEmojiManager", () => {
  test("GIVEN create THEN the data URI is sent as image and the emoji cached", async () => {
    const client = createClient();
    const post = vi.spyOn(container.rest, "post").mockResolvedValue(emoji("42", "howl"));

    const created = await new Guild(guildData()).emojis.create({
      attachment: "data:image/png;base64,AA",
      name: "howl",
    });

    expect(post).toHaveBeenCalledWith(Routes.guildEmojis(guildId), {
      body: { image: "data:image/png;base64,AA", name: "howl", roles: undefined },
      reason: undefined,
    });
    expect(created.guildId).toBe(guildId);
    expect(await client.guilds.emojis(guildId).get("42")).toBeDefined();
  });

  test("GIVEN roles.add THEN the emoji is edited with the union of its roles", async () => {
    const client = createClient();
    const patch = vi
      .spyOn(container.rest, "patch")
      .mockResolvedValue(emoji("42", "howl", { roles: ["1", "2"] }));
    const structure = new GuildEmoji({
      ...emoji("42", "howl", { roles: ["1"] }),
      guild_id: guildId,
    });

    const edited = await structure.roles.add("2");

    expect(patch).toHaveBeenCalledWith(Routes.guildEmoji(guildId, "42"), {
      body: { name: undefined, roles: ["1", "2"] },
      reason: undefined,
    });
    expect(edited.roleIds).toEqual(["1", "2"]);
    expect(client.guilds).toBeDefined();
  });
});

describe("Sticker", () => {
  test("GIVEN each format THEN the URL uses the matching extension", () => {
    expect(new Sticker(sticker("1")).url).toBe("https://cdn.discordapp.com/stickers/1.png");
    expect(new Sticker(sticker("2", { format_type: StickerFormatType.GIF })).url).toBe(
      "https://media.discordapp.net/stickers/2.gif",
    );
    expect(new Sticker(sticker("3", { format_type: StickerFormatType.Lottie })).url).toBe(
      "https://cdn.discordapp.com/stickers/3.json",
    );
  });

  test("GIVEN create THEN the sticker is uploaded as a multipart form", async () => {
    const client = createClient();
    const post = vi.spyOn(container.rest, "post").mockResolvedValue(sticker("1"));
    const file = { name: "wolf.png", data: Buffer.from("png") };

    await client.guilds.stickers(guildId).create({ file, name: "wolf", tags: "wolf" });

    expect(post).toHaveBeenCalledWith(Routes.guildStickers(guildId), {
      appendToFormData: true,
      body: { name: "wolf", tags: "wolf", description: "" },
      files: [{ ...file, key: "file" }],
      reason: undefined,
    });
  });

  test("GIVEN a standard sticker THEN fetchPack finds its pack", async () => {
    createClient();
    vi.spyOn(container.rest, "get").mockResolvedValue({
      sticker_packs: [
        {
          id: "9",
          name: "Wolves",
          description: "",
          sku_id: "1",
          stickers: [sticker("1", { pack_id: "9" })],
        },
      ],
    });

    const pack = await new Sticker(
      sticker("1", { type: StickerType.Standard, pack_id: "9" }),
    ).fetchPack();

    expect(pack?.name).toBe("Wolves");
    expect(pack?.stickers[0]).toBeInstanceOf(Sticker);
  });
});

describe("Invites", () => {
  const rest = {
    code: "wolves",
    type: InviteType.Guild,
    guild: {
      id: guildId,
      name: "Pack",
      icon: null,
      splash: null,
      banner: null,
      description: null,
      features: [],
      verification_level: 0,
      vanity_url_code: null,
      nsfw_level: 0,
      premium_subscription_count: 0,
    },
    channel: { id: "20", type: ChannelType.GuildText, name: "general" },
    inviter: user,
    expires_at: null,
    created_at: "2024-01-01T00:00:00.000Z",
    max_age: 3600,
    max_uses: 0,
    uses: 2,
    temporary: false,
  };

  test("GIVEN each invite type THEN the factory builds the matching structure", () => {
    expect(createInvite(rest)).toBeInstanceOf(GuildInvite);
    expect(createInvite({ code: "g", type: InviteType.GroupDM })).toBeInstanceOf(GroupDMInvite);
    expect(createInvite({ code: "f", type: InviteType.Friend })).toBeInstanceOf(BaseInvite);
  });

  test("GIVEN REST and gateway payloads THEN both expose the same fields", () => {
    const fromRest = new GuildInvite(rest);
    const fromGateway = new GuildInvite({
      code: "wolves",
      guild_id: guildId,
      channel_id: "20",
      max_age: 3600,
      created_at: "2024-01-01T00:00:00.000Z",
      uses: 0,
    });

    for (const invite of [fromRest, fromGateway]) {
      expect(invite.guildId).toBe(guildId);
      expect(invite.channelId).toBe("20");
      expect(invite.expiresTimestamp).toBe(Date.parse("2024-01-01T01:00:00.000Z"));
      expect(`${invite}`).toBe("https://discord.gg/wolves");
    }

    expect(fromRest.guild?.name).toBe("Pack");
    expect(fromRest.inviter?.username).toBe("wolf");
  });

  test("GIVEN fetchInvite with a URL THEN the code is extracted and counts requested", async () => {
    const client = createClient();
    const get = vi.spyOn(container.rest, "get").mockResolvedValue(rest);

    const invite = await client.fetchInvite("https://discord.gg/wolves");

    expect(get.mock.calls[0]![0]).toBe(Routes.invite("wolves"));
    expect(String((get.mock.calls[0]![1] as { query: URLSearchParams }).query)).toBe(
      "with_counts=true",
    );
    expect(invite).toBeInstanceOf(GuildInvite);
  });

  test("GIVEN create and delete THEN the invite enters and leaves the cache", async () => {
    const client = createClient();
    const post = vi.spyOn(container.rest, "post").mockResolvedValue(rest);
    vi.spyOn(container.rest, "delete").mockResolvedValue(undefined);
    const invites = client.guilds.invites(guildId);

    await invites.create("20", { maxAge: 3600, unique: true });
    expect(post.mock.calls[0]![1]).toMatchObject({ body: { max_age: 3600, unique: true } });
    expect(await invites.get("wolves")).toBeInstanceOf(GuildInvite);

    await invites.delete("wolves");
    expect(await invites.get("wolves")).toBeUndefined();
  });
});

describe("guild asset events", () => {
  test("GIVEN GUILD_EMOJIS_UPDATE THEN created, updated, and deleted emojis are told apart", async () => {
    const client = createClient();
    const created = record(client, "emojiCreate");
    const updated = record(client, "emojiUpdate");
    const deleted = record(client, "emojiDelete");

    await dispatch(client, GatewayDispatchEvents.GuildEmojisUpdate, {
      guild_id: guildId,
      emojis: [emoji("1", "kept"), emoji("2", "renamed")],
    });
    await dispatch(client, GatewayDispatchEvents.GuildEmojisUpdate, {
      guild_id: guildId,
      emojis: [emoji("1", "kept"), emoji("2", "renamed again"), emoji("3", "new")],
    });
    await dispatch(client, GatewayDispatchEvents.GuildEmojisUpdate, {
      guild_id: guildId,
      emojis: [emoji("2", "renamed again"), emoji("3", "new")],
    });

    expect(created.map(([value]) => value.name)).toEqual(["kept", "renamed", "new"]);
    expect(updated.map(([old, value]) => `${old.name} -> ${value.name}`)).toEqual([
      "renamed -> renamed again",
    ]);
    expect(deleted.map(([value]) => value.name)).toEqual(["kept"]);
  });

  test("GIVEN no cache THEN emoji events are not emitted", async () => {
    const client = createClient(null);
    const created = record(client, "emojiCreate");

    await dispatch(client, GatewayDispatchEvents.GuildEmojisUpdate, {
      guild_id: guildId,
      emojis: [emoji("1", "x")],
    });

    expect(created).toHaveLength(0);
  });

  test("GIVEN GUILD_STICKERS_UPDATE THEN sticker events are emitted", async () => {
    const client = createClient();
    const created = record(client, "stickerCreate");
    const deleted = record(client, "stickerDelete");

    await dispatch(client, GatewayDispatchEvents.GuildStickersUpdate, {
      guild_id: guildId,
      stickers: [sticker("1")],
    });
    await dispatch(client, GatewayDispatchEvents.GuildStickersUpdate, {
      guild_id: guildId,
      stickers: [],
    });

    expect(created[0]![0]).toBeInstanceOf(Sticker);
    expect(deleted[0]![0].id).toBe("1");
  });

  test("GIVEN INVITE_CREATE then INVITE_DELETE THEN the deleted invite comes from the cache", async () => {
    const client = createClient();
    const created = record(client, "inviteCreate");
    const deleted = record(client, "inviteDelete");

    await dispatch(client, GatewayDispatchEvents.InviteCreate, {
      code: "wolves",
      guild_id: guildId,
      channel_id: "20",
      created_at: "2024-01-01T00:00:00.000Z",
      max_age: 0,
      max_uses: 0,
      temporary: false,
      uses: 0,
      expires_at: null,
    });
    await dispatch(client, GatewayDispatchEvents.InviteDelete, {
      code: "wolves",
      guild_id: guildId,
      channel_id: "20",
    });

    expect(created[0]![0].code).toBe("wolves");
    expect(deleted[0]![0]?.channelId).toBe("20");
    expect(deleted[0]![1].code).toBe("wolves");
  });
});
