import { WebSocketShardEvents } from "@discordjs/ws";
import { container } from "@wolfstar/http-framework";
import { createInMemoryCache, type Cache } from "@wolfstar/plugin-cache";
import {
  ChannelType,
  GatewayDispatchEvents,
  GatewayOpcodes,
  OverwriteType,
  Routes,
  StickerFormatType,
  StickerType,
  type APIRole,
  type GatewayDispatchPayload,
} from "discord-api-types/v10";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  GatewayClient,
  GuildEmoji,
  PermissionOverwriteManager,
  Sticker,
  type GatewayEventMap,
  type GatewayEventName,
} from "../src/index.js";

const guildId = "100000000000000010";
const channelId = "200000000000000020";
const roleId = "300000000000000030";
const userId = "600000000000000600";

function createClient(cache: Cache | null = null) {
  return new GatewayClient({
    discordPublicKey: "0".repeat(64),
    discordToken: "test-token",
    clientId: "266624760782258186",
    intents: 0,
    cache,
  });
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

function role(id: string, position = 1): APIRole {
  return {
    id,
    name: id,
    color: 0,
    colors: { primary_color: 0, secondary_color: null, tertiary_color: null },
    hoist: false,
    position,
    permissions: "0",
    managed: false,
    mentionable: false,
    flags: 0,
  };
}

const emoji = {
  id: "400000000000000040",
  name: "wolf",
  roles: [],
  animated: false,
  available: true,
};
const sticker = {
  id: "500000000000000050",
  name: "howl",
  description: null,
  tags: "wolf",
  type: StickerType.Guild,
  format_type: StickerFormatType.PNG,
  available: true,
  guild_id: guildId,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("aggregate asset events", () => {
  test("GIVEN no cache THEN GUILD_EMOJIS_UPDATE emits guildEmojisUpdate only", async () => {
    const client = createClient();
    const updates = record(client, "guildEmojisUpdate");
    const created = record(client, "emojiCreate");

    await dispatch(client, GatewayDispatchEvents.GuildEmojisUpdate, {
      guild_id: guildId,
      emojis: [emoji],
    });

    expect(updates).toHaveLength(1);
    const [[id, emojis]] = updates;
    expect(id).toBe(guildId);
    expect(emojis[0]).toBeInstanceOf(GuildEmoji);
    expect(created).toHaveLength(0);
  });

  test("GIVEN a cache THEN GUILD_EMOJIS_UPDATE emits both the aggregate and the diff", async () => {
    const client = createClient(createInMemoryCache());
    const updates = record(client, "guildEmojisUpdate");
    const created = record(client, "emojiCreate");

    await dispatch(client, GatewayDispatchEvents.GuildEmojisUpdate, {
      guild_id: guildId,
      emojis: [emoji],
    });

    expect(updates).toHaveLength(1);
    expect(created).toHaveLength(1);
  });

  test("GIVEN no cache THEN GUILD_STICKERS_UPDATE emits guildStickersUpdate only", async () => {
    const client = createClient();
    const updates = record(client, "guildStickersUpdate");
    const created = record(client, "stickerCreate");

    await dispatch(client, GatewayDispatchEvents.GuildStickersUpdate, {
      guild_id: guildId,
      stickers: [sticker],
    });

    expect(updates).toHaveLength(1);
    expect(updates[0]![1][0]).toBeInstanceOf(Sticker);
    expect(created).toHaveLength(0);
  });
});

describe("permission overwrite types", () => {
  test("GIVEN no roles cache THEN a role ID is typed from the guild's fetched roles", async () => {
    const client = createClient();
    const get = vi.spyOn(container.rest, "get").mockResolvedValue([role(guildId, 0), role(roleId)]);
    const put = vi.spyOn(container.rest, "put").mockResolvedValue(undefined);
    const overwrites = new PermissionOverwriteManager(client, channelId, guildId, []);

    await overwrites.create(roleId, { ViewChannel: true });
    await overwrites.create(userId, { ViewChannel: true });

    expect(get).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenCalledWith(Routes.guildRoles(guildId), expect.anything());
    expect(
      put.mock.calls.map(([, options]) => (options as { body: { type: number } }).body.type),
    ).toEqual([OverwriteType.Role, OverwriteType.Member]);
  });
});

describe("presences", () => {
  test("GIVEN an uncached presence THEN fetch explains presences only come from the gateway", async () => {
    const client = createClient();

    await expect(client.presences.fetch(guildId, userId)).rejects.toThrow(
      /only received from the gateway.*presences cache/,
    );
  });
});

describe("threads", () => {
  test("GIVEN no thread member cache THEN joined is unknown unless the payload tells", async () => {
    const client = createClient();
    const thread = {
      id: "700000000000000070",
      type: ChannelType.PublicThread,
      guild_id: guildId,
      parent_id: channelId,
      name: "thread",
      thread_metadata: {
        archived: false,
        auto_archive_duration: 60,
        archive_timestamp: "2024-01-01T00:00:00.000Z",
        locked: false,
      },
    };

    const unknown = await client.threads._build(thread as never);
    const joined = await client.threads._build({
      ...thread,
      member: {
        id: thread.id,
        user_id: "266624760782258186",
        join_timestamp: "2024-01-01T00:00:00.000Z",
        flags: 0,
      },
    } as never);

    expect(unknown.joined).toBeNull();
    expect(joined.joined).toBe(true);
  });
});

describe("member roles", () => {
  test("GIVEN uncached roles THEN fetch reads every role of the guild in one request", async () => {
    const client = createClient();
    const get = vi
      .spyOn(container.rest, "get")
      .mockResolvedValue([role(guildId, 0), role("1", 1), role("2", 2), role("3", 3)]);
    const member = client.members.cache.construct({
      guild_id: guildId,
      user: { id: userId, username: "wolf", discriminator: "0", global_name: null, avatar: null },
      roles: ["1", "2", "3"],
      joined_at: "2024-01-01T00:00:00.000Z",
      deaf: false,
      mute: false,
      flags: 0,
    });

    const roles = await member.roles.fetch();

    expect(roles.map((value) => value.id)).toEqual(["3", "2", "1", guildId]);
    expect(get).toHaveBeenCalledOnce();
    expect(get).toHaveBeenCalledWith(Routes.guildRoles(guildId), expect.anything());
  });
});
