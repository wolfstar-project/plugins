import { WebSocketShardEvents } from "@discordjs/ws";
import { container } from "@wolfstar/http-framework";
import {
  ChannelType,
  GatewayDispatchEvents,
  GatewayOpcodes,
  MessageType,
  type APIRole,
  type APIUser,
  type GatewayDispatchPayload,
} from "discord-api-types/v10";
import { afterEach, describe, expect, test, vi } from "vitest";
import { GatewayClient, type GatewayEventMap, type GatewayEventName } from "../src/index.js";
import { cacheModes, type CacheMode } from "./fixtures/cacheModes.js";

const guildId = "100000000000000010";
const channelId = "200000000000000020";
const roleId = "300000000000000030";
const messageId = "1200000000000000000";
const user: APIUser = {
  id: "600000000000000600",
  username: "wolf",
  discriminator: "0",
  global_name: null,
  avatar: null,
};
const other: APIUser = { ...user, id: "600000000000000601", username: "pup" };

const role: APIRole = {
  id: roleId,
  name: "Pack",
  color: 0,
  colors: { primary_color: 0, secondary_color: null, tertiary_color: null },
  hoist: false,
  position: 1,
  permissions: "0",
  managed: false,
  mentionable: false,
  flags: 0,
};
const member = {
  user,
  roles: [],
  joined_at: "2024-01-01T00:00:00.000Z",
  deaf: false,
  mute: false,
  flags: 0,
};
const channel = { id: channelId, type: ChannelType.GuildText, guild_id: guildId, name: "general" };
const message = {
  id: messageId,
  channel_id: channelId,
  guild_id: guildId,
  author: user,
  member,
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
};

function createClient(mode: CacheMode) {
  return new GatewayClient({
    discordPublicKey: "0".repeat(64),
    discordToken: "test-token",
    clientId: "266624760782258186",
    intents: 0,
    ...cacheModes[mode](),
  });
}

async function dispatch(client: GatewayClient, t: GatewayDispatchEvents, d: unknown) {
  const payload = { op: GatewayOpcodes.Dispatch, s: 1, t, d } as GatewayDispatchPayload;
  client.gateway.emit(WebSocketShardEvents.Dispatch, payload, 0);
  await client.idle();
}

// Records every emitted event of the given names, in order.
function recordAll(client: GatewayClient, names: readonly GatewayEventName[]) {
  const calls = new Map<GatewayEventName, unknown[][]>();
  for (const name of names) {
    calls.set(name, []);
    client.on(name, (...args: unknown[]) => calls.get(name)!.push(args));
  }

  return <Event extends GatewayEventName>(event: Event) =>
    calls.get(event) as unknown as GatewayEventMap[Event][];
}

const events = [
  "guildCreate",
  "channelUpdate",
  "messageCreate",
  "messageUpdate",
  "messageReactionAdd",
  "messageDelete",
  "guildMemberAdd",
  "guildMemberUpdate",
  "guildMemberRemove",
  "guildRoleCreate",
  "guildRoleUpdate",
  "guildRoleDelete",
  "guildEmojisUpdate",
] as const satisfies readonly GatewayEventName[];

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each(Object.keys(cacheModes) as CacheMode[])("with a %s cache", (mode) => {
  test("GIVEN a guild's lifecycle THEN every event is emitted once, without errors nor API calls", async () => {
    const client = createClient(mode);
    const rest = (["get", "post", "put", "patch", "delete"] as const).map((method) =>
      vi.spyOn(container.rest, method).mockRejectedValue(new Error(`unexpected ${method}`)),
    );
    const errors = vi.fn();
    client.on("error", errors);
    client.on("cacheError", errors);
    const calls = recordAll(client, events);

    await dispatch(client, GatewayDispatchEvents.GuildCreate, {
      id: guildId,
      name: "Pack",
      channels: [channel],
      members: [member],
      roles: [{ ...role, id: guildId, name: "@everyone", position: 0 }, role],
      emojis: [],
      stickers: [],
    });
    await dispatch(client, GatewayDispatchEvents.ChannelUpdate, { ...channel, name: "renamed" });
    await dispatch(client, GatewayDispatchEvents.MessageCreate, message);
    await dispatch(client, GatewayDispatchEvents.MessageUpdate, { ...message, content: "edited" });
    await dispatch(client, GatewayDispatchEvents.MessageReactionAdd, {
      user_id: user.id,
      channel_id: channelId,
      message_id: messageId,
      guild_id: guildId,
      emoji: { id: null, name: "wolf" },
      type: 0,
      burst: false,
      member,
    });
    await dispatch(client, GatewayDispatchEvents.MessageDelete, {
      id: messageId,
      channel_id: channelId,
      guild_id: guildId,
    });
    await dispatch(client, GatewayDispatchEvents.GuildMemberAdd, {
      ...member,
      user: other,
      guild_id: guildId,
    });
    await dispatch(client, GatewayDispatchEvents.GuildMemberUpdate, {
      ...member,
      nick: "Alpha",
      guild_id: guildId,
    });
    await dispatch(client, GatewayDispatchEvents.GuildMemberRemove, {
      user: other,
      guild_id: guildId,
    });
    await dispatch(client, GatewayDispatchEvents.GuildRoleCreate, {
      guild_id: guildId,
      role: { ...role, id: "300000000000000031" },
    });
    await dispatch(client, GatewayDispatchEvents.GuildRoleUpdate, {
      guild_id: guildId,
      role: { ...role, name: "Renamed" },
    });
    await dispatch(client, GatewayDispatchEvents.GuildRoleDelete, {
      guild_id: guildId,
      role_id: roleId,
    });
    await dispatch(client, GatewayDispatchEvents.GuildEmojisUpdate, {
      guild_id: guildId,
      emojis: [
        { id: "400000000000000040", name: "wolf", roles: [], animated: false, available: true },
      ],
    });

    for (const event of events) expect(calls(event), event).toHaveLength(1);
    expect(errors).not.toHaveBeenCalled();
    for (const spy of rest) expect(spy).not.toHaveBeenCalled();

    // The previous states only exist with the cache of their entity.
    const previous = {
      channelUpdate: calls("channelUpdate")[0]![0],
      messageUpdate: calls("messageUpdate")[0]![0],
      messageDelete: calls("messageDelete")[0]![0],
      guildMemberUpdate: calls("guildMemberUpdate")[0]![0],
      guildMemberRemove: calls("guildMemberRemove")[0]![0],
      guildRoleUpdate: calls("guildRoleUpdate")[0]![0],
      guildRoleDelete: calls("guildRoleDelete")[0]![0],
    };
    for (const [event, value] of Object.entries(previous)) {
      if (mode === "full" || mode === "collection") expect(value, event).not.toBeNull();
      else expect(value, event).toBeNull();
    }

    expect(calls("channelUpdate")[0]![1].name).toBe("renamed");
    expect(calls("messageUpdate")[0]![1].content).toBe("edited");
    expect(calls("guildMemberUpdate")[0]![1].nickname).toBe("Alpha");
    expect(calls("guildRoleUpdate")[0]![1].name).toBe("Renamed");
    expect(calls("guildEmojisUpdate")[0]![1]).toHaveLength(1);
  });
});
