import { WebSocketShardEvents } from "@discordjs/ws";
import { createInMemoryCache } from "@wolfstar/plugin-cache";
import {
  GatewayDispatchEvents,
  GatewayOpcodes,
  MessageType,
  type APIMessage,
  type APIUser,
  type GatewayDispatchPayload,
} from "discord-api-types/v10";
import { describe, expect, test, vi } from "vitest";
import { GatewayClient } from "../src/index.js";

export const guildId = "100000000000000010";
export const channelId = "200000000000000020";
export const author: APIUser = {
  id: "600000000000000600",
  username: "wolf",
  discriminator: "0",
  global_name: "Wolf",
  avatar: null,
};

export function message(extra: Partial<APIMessage> = {}): APIMessage {
  return {
    id: "1200000000000000000",
    channel_id: channelId,
    guild_id: guildId,
    author,
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
    ...extra,
  };
}

/** A producer and a worker sharing one cache, like a gateway process and a worker sharing Redis. */
export function createPair() {
  const cache = createInMemoryCache();
  const options = {
    discordPublicKey: "0".repeat(64),
    discordToken: "test-token",
    clientId: "266624760782258186",
    intents: 0,
    cache,
  };
  return { producer: new GatewayClient(options), worker: new GatewayClient(options) };
}

export async function feed(
  client: GatewayClient,
  t: GatewayDispatchEvents,
  d: unknown,
  shardId = 0,
) {
  const payload = { op: GatewayOpcodes.Dispatch, s: 1, t, d } as GatewayDispatchPayload;
  client.gateway.emit(WebSocketShardEvents.Dispatch, payload, shardId);
  await client.idle();
}

export type Emitted = [event: string, ...args: unknown[]];

/** Every event a client emits, in order. */
export function recordAll(client: GatewayClient): Emitted[] {
  const calls: Emitted[] = [];
  const emit = client.emit.bind(client) as (event: string, ...args: unknown[]) => boolean;
  vi.spyOn(client, "emit").mockImplementation(((event: string, ...args: unknown[]) => {
    calls.push([event, ...args]);
    return emit(event, ...args);
  }) as never);
  return calls;
}

/** The events a listener of the client's public API sees: neither `raw` nor `dispatch`. */
export function visible(calls: readonly Emitted[]): Emitted[] {
  return calls.filter(([event]) => event !== "raw" && event !== "dispatch");
}

/** Structures compare by class and raw data, everything else as is. */
export function plain(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === "object" && typeof (value as any).toJSON === "function") {
    return [value.constructor.name, (value as any).toJSON()];
  }
  return value;
}

export type Dispatched = [payload: GatewayDispatchPayload, shardId: number, state: unknown];

export function captureDispatches(client: GatewayClient): Dispatched[] {
  const dispatched: Dispatched[] = [];
  client.on("dispatch", (...args) => void dispatched.push(args as Dispatched));
  return dispatched;
}

describe("the dispatch event", () => {
  test("GIVEN an update of a cached message THEN dispatch carries the previous state", async () => {
    const { producer } = createPair();
    const dispatched = captureDispatches(producer);

    await feed(producer, GatewayDispatchEvents.MessageCreate, message());
    await feed(producer, GatewayDispatchEvents.MessageUpdate, message({ content: "edited" }));

    const [create, update] = dispatched;
    expect(create![2]).toBeUndefined();
    expect((update![2] as { content: string }).content).toBe("hello");
  });
});
