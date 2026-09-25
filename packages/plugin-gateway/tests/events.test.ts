import { WebSocketShardEvents } from "@discordjs/ws";
import { createInMemoryCache } from "@wolfstar/plugin-cache";
import {
  GatewayDispatchEvents,
  GatewayOpcodes,
  type GatewayDispatchPayload,
} from "discord-api-types/v10";
import { describe, expect, test } from "vitest";
import {
  GatewayClient,
  Typing,
  type GatewayEventMap,
  type GatewayEventName,
} from "../src/index.js";

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

function record<Event extends GatewayEventName>(client: GatewayClient, event: Event) {
  const calls: GatewayEventMap[Event][] = [];
  client.on(event, (...args: any[]) => {
    calls.push(args as GatewayEventMap[Event]);
  });
  return calls;
}

describe("raw-data events", () => {
  test("GIVEN TYPING_START THEN a Typing structure is emitted", async () => {
    const client = createClient();
    const calls = record(client, "typingStart");

    await dispatch(client, GatewayDispatchEvents.TypingStart, {
      channel_id: "20",
      guild_id: "10",
      user_id: "1",
      timestamp: 1_700_000_000,
      member: {
        roles: [],
        joined_at: "2024-01-01T00:00:00.000Z",
        deaf: false,
        mute: false,
        flags: 0,
      },
    });

    const [[typing]] = calls;
    expect(typing).toBeInstanceOf(Typing);
    expect(typing.startedTimestamp).toBe(1_700_000_000_000);
    expect(typing.inGuild()).toBe(true);
    expect(typing.member?.guildId).toBe("10");
  });

  test("GIVEN CHANNEL_PINS_UPDATE and WEBHOOKS_UPDATE THEN the raw data is emitted", async () => {
    const client = createClient();
    const pins = record(client, "channelPinsUpdate");
    const webhooks = record(client, "webhooksUpdate");

    await dispatch(client, GatewayDispatchEvents.ChannelPinsUpdate, {
      channel_id: "20",
      guild_id: "10",
      last_pin_timestamp: null,
    });
    await dispatch(client, GatewayDispatchEvents.WebhooksUpdate, {
      channel_id: "20",
      guild_id: "10",
    });

    expect(pins[0]![0].channel_id).toBe("20");
    expect(webhooks[0]![0].guild_id).toBe("10");
  });
});
