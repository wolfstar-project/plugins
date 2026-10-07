import { WebSocketShardEvents } from "@discordjs/ws";
import { createInMemoryCache } from "@wolfstar/plugin-cache";
import {
  GatewayDispatchEvents,
  GatewayOpcodes,
  type GatewayDispatchPayload,
} from "discord-api-types/v10";
import { describe, expect, test } from "vitest";
import { GatewayClient, GatewayEvents, type GatewayEventName } from "../src/index.js";

// Every key of `GatewayEventMap`, so a missing or extra one fails to compile here rather than silently drifting from
// `GatewayEvents`.
const eventMapKeys: Record<GatewayEventName, true> = {
  raw: true,
  dispatch: true,
  shardReady: true,
  clientReady: true,
  shardResume: true,
  shardClose: true,
  shardError: true,
  cacheError: true,
  cacheSweep: true,
  guildCreate: true,
  guildUpdate: true,
  guildDelete: true,
  channelCreate: true,
  channelUpdate: true,
  channelDelete: true,
  channelPinsUpdate: true,
  webhooksUpdate: true,
  threadCreate: true,
  threadUpdate: true,
  threadDelete: true,
  threadListSync: true,
  threadMemberUpdate: true,
  threadMembersUpdate: true,
  messageCreate: true,
  messageUpdate: true,
  messageDelete: true,
  messageDeleteBulk: true,
  messageReactionAdd: true,
  messageReactionRemove: true,
  messageReactionRemoveAll: true,
  messageReactionRemoveEmoji: true,
  messagePollVoteAdd: true,
  messagePollVoteRemove: true,
  guildMemberAdd: true,
  guildMemberUpdate: true,
  guildMemberRemove: true,
  guildMembersChunk: true,
  guildRoleCreate: true,
  guildRoleUpdate: true,
  guildRoleDelete: true,
  userUpdate: true,
  guildEmojisUpdate: true,
  emojiCreate: true,
  emojiUpdate: true,
  emojiDelete: true,
  guildStickersUpdate: true,
  stickerCreate: true,
  stickerUpdate: true,
  stickerDelete: true,
  inviteCreate: true,
  inviteDelete: true,
  typingStart: true,
  voiceServerUpdate: true,
  guildScheduledEventCreate: true,
  guildScheduledEventUpdate: true,
  guildScheduledEventDelete: true,
  guildScheduledEventUserAdd: true,
  guildScheduledEventUserRemove: true,
  stageInstanceCreate: true,
  stageInstanceUpdate: true,
  stageInstanceDelete: true,
  guildSoundboardSoundCreate: true,
  guildSoundboardSoundUpdate: true,
  guildSoundboardSoundDelete: true,
  guildSoundboardSoundsUpdate: true,
  soundboardSounds: true,
  guildBanAdd: true,
  guildBanRemove: true,
  guildAuditLogEntryCreate: true,
  autoModerationRuleCreate: true,
  autoModerationRuleUpdate: true,
  autoModerationRuleDelete: true,
  autoModerationActionExecution: true,
  guildIntegrationsUpdate: true,
  integrationCreate: true,
  integrationUpdate: true,
  integrationDelete: true,
  voiceStateUpdate: true,
  voiceChannelStatusUpdate: true,
  voiceChannelStartTimeUpdate: true,
  channelInfo: true,
  presenceUpdate: true,
};

function createClient() {
  return new GatewayClient({
    discordPublicKey: "0".repeat(64),
    discordToken: "test-token",
    clientId: "266624760782258186",
    intents: 0,
    cache: createInMemoryCache(),
  });
}

async function dispatch(client: GatewayClient, t: GatewayDispatchEvents, d: unknown) {
  const payload = { op: GatewayOpcodes.Dispatch, s: 1, t, d } as GatewayDispatchPayload;
  client.gateway.emit(WebSocketShardEvents.Dispatch, payload, 0);
  await client.idle();
}

describe("GatewayEvents", () => {
  test("GIVEN GatewayEventMap THEN GatewayEvents has the same value for every key", () => {
    const values = Object.values(GatewayEvents);
    expect(values.toSorted()).toEqual(Object.keys(eventMapKeys).toSorted());
    // Every member's value is the plain event name, interchangeable with the string literal.
    expect(GatewayEvents.MessageCreate).toBe("messageCreate" satisfies GatewayEventName);
  });

  test("GIVEN a listener on the enum member THEN it receives the event a string listener would", async () => {
    const client = createClient();
    const calls: unknown[][] = [];
    client.on(GatewayEvents.GuildCreate, (...args) => calls.push(args));

    await dispatch(client, GatewayDispatchEvents.GuildCreate, {
      id: "1",
      name: "Pack",
      channels: [],
      threads: [],
      members: [],
      presences: [],
      voice_states: [],
      stage_instances: [],
      guild_scheduled_events: [],
      soundboard_sounds: [],
    });

    expect(calls).toHaveLength(1);
    expect((calls[0]![0] as { id: string }).id).toBe("1");
  });
});
