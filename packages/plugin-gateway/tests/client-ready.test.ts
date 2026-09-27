import { WebSocketShardEvents, WebSocketShardStatus } from "@discordjs/ws";
import { createInMemoryCache } from "@wolfstar/plugin-cache";
import {
  GatewayDispatchEvents,
  GatewayIntentBits,
  GatewayOpcodes,
  type GatewayDispatchPayload,
} from "discord-api-types/v10";
import { afterEach, describe, expect, test, vi } from "vitest";
import { GatewayClient, GatewayEvents, type GatewayClientOptions } from "../src/index.js";

const user = {
  id: "266624760782258186",
  username: "wolf",
  discriminator: "0",
  global_name: "Wolf",
  avatar: null,
};

function createClient(options: Partial<GatewayClientOptions> = {}) {
  return new GatewayClient({
    discordPublicKey: "0".repeat(64),
    discordToken: "test-token",
    clientId: "266624760782258186",
    intents: GatewayIntentBits.Guilds,
    cache: createInMemoryCache(),
    ...options,
  });
}

async function dispatch(client: GatewayClient, t: GatewayDispatchEvents, d: unknown, shardId = 0) {
  const payload = { op: GatewayOpcodes.Dispatch, s: 1, t, d } as GatewayDispatchPayload;
  client.gateway.emit(WebSocketShardEvents.Dispatch, payload, shardId);
  await client.idle();
}

function ready(guilds: readonly { id: string; unavailable?: boolean }[] = []) {
  return { user, guilds, session_id: "s" };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("GatewayClient#clientReady", () => {
  test("GIVEN READY with no unavailable guilds THEN clientReady is emitted right away", async () => {
    const client = createClient();
    const calls: unknown[][] = [];
    client.on(GatewayEvents.ClientReady, (...args) => calls.push(args));

    expect(client.isClientReady()).toBe(false);
    expect(client.clientReadyAt).toBeNull();

    await dispatch(client, GatewayDispatchEvents.Ready, ready());

    expect(calls).toEqual([[client]]);
    expect(client.isClientReady()).toBe(true);
    expect(client.clientReadyAt).toBeInstanceOf(Date);
    expect(client.clientReadyTimestamp).not.toBeNull();
  });

  test("GIVEN unavailable guilds THEN it waits for their GUILD_CREATE", async () => {
    const client = createClient();
    const calls: unknown[][] = [];
    client.on(GatewayEvents.ClientReady, (...args) => calls.push(args));

    await dispatch(client, GatewayDispatchEvents.Ready, ready([{ id: "10", unavailable: true }]));
    expect(calls).toHaveLength(0);
    expect(client.isClientReady()).toBe(false);

    await dispatch(client, GatewayDispatchEvents.GuildCreate, {
      id: "10",
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
    expect(client.isClientReady()).toBe(true);
  });

  test("GIVEN an unavailable guild that is deleted instead THEN it still becomes ready", async () => {
    const client = createClient();
    const calls: unknown[][] = [];
    client.on(GatewayEvents.ClientReady, (...args) => calls.push(args));

    await dispatch(client, GatewayDispatchEvents.Ready, ready([{ id: "10", unavailable: true }]));
    await dispatch(client, GatewayDispatchEvents.GuildDelete, { id: "10" });

    expect(calls).toHaveLength(1);
  });

  test("GIVEN unavailable guilds still pending THEN waitGuildTimeout emits clientReady anyway", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const client = createClient({ waitGuildTimeout: 1_000 });
    const calls: unknown[][] = [];
    client.on(GatewayEvents.ClientReady, (...args) => calls.push(args));

    await dispatch(client, GatewayDispatchEvents.Ready, ready([{ id: "10", unavailable: true }]));
    expect(calls).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1_000);

    expect(calls).toHaveLength(1);
    expect(client.isClientReady()).toBe(true);
  });

  test("GIVEN no Guilds intent THEN it does not wait at all", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const client = createClient({ intents: 0, waitGuildTimeout: 15_000 });
    const calls: unknown[][] = [];
    client.on(GatewayEvents.ClientReady, (...args) => calls.push(args));

    await dispatch(client, GatewayDispatchEvents.Ready, ready([{ id: "10", unavailable: true }]));
    expect(calls).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(0);

    expect(calls).toHaveLength(1);
  });

  test("GIVEN it already fired THEN a later GUILD_CREATE does not fire it again", async () => {
    const client = createClient();
    const calls: unknown[][] = [];
    client.on(GatewayEvents.ClientReady, (...args) => calls.push(args));

    await dispatch(client, GatewayDispatchEvents.Ready, ready());
    expect(calls).toHaveLength(1);

    await dispatch(client, GatewayDispatchEvents.GuildCreate, {
      id: "20",
      name: "Another",
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
  });

  test("GIVEN a shard still connecting THEN clientReady waits for it, even with no guilds pending", async () => {
    const client = createClient();
    const statuses = vi.spyOn(client.gateway, "fetchStatus").mockResolvedValue(
      new Map([
        [0, WebSocketShardStatus.Ready],
        [1, WebSocketShardStatus.Connecting],
      ]) as never,
    );
    const calls: unknown[][] = [];
    client.on(GatewayEvents.ClientReady, (...args) => calls.push(args));

    await dispatch(client, GatewayDispatchEvents.Ready, ready(), 0);
    expect(calls).toHaveLength(0);

    statuses.mockResolvedValue(
      new Map([
        [0, WebSocketShardStatus.Ready],
        [1, WebSocketShardStatus.Ready],
      ]) as never,
    );
    await dispatch(client, GatewayDispatchEvents.Ready, ready(), 1);

    expect(calls).toHaveLength(1);
  });

  test("GIVEN waitGuildTimeout elapses on one shard THEN it forgets that shard's guilds but still waits for the others", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const client = createClient({ waitGuildTimeout: 1_000 });
    const statuses = vi.spyOn(client.gateway, "fetchStatus").mockResolvedValue(
      new Map([
        [0, WebSocketShardStatus.Ready],
        [1, WebSocketShardStatus.Connecting],
      ]) as never,
    );
    const calls: unknown[][] = [];
    client.on(GatewayEvents.ClientReady, (...args) => calls.push(args));

    await dispatch(
      client,
      GatewayDispatchEvents.Ready,
      ready([{ id: "10", unavailable: true }]),
      0,
    );
    await vi.advanceTimersByTimeAsync(1_000);
    // The guild's wait timed out, but shard 1 is still connecting: clientReady must not fire yet.
    expect(calls).toHaveLength(0);

    statuses.mockResolvedValue(
      new Map([
        [0, WebSocketShardStatus.Ready],
        [1, WebSocketShardStatus.Ready],
      ]) as never,
    );
    await dispatch(client, GatewayDispatchEvents.Ready, ready(), 1);

    expect(calls).toHaveLength(1);

    // The forgotten guild's late GUILD_CREATE does not fire it a second time.
    await dispatch(client, GatewayDispatchEvents.GuildCreate, {
      id: "10",
      name: "Late",
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
  });
});
