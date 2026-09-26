import { describe, expect, test, vi } from "vitest";
import {
  ForkStrategy,
  ShardManager,
  ShardSpawnError,
  ShardStatus,
  ShardUnavailableError,
  WorkerStrategy,
  registerStrategy,
  shardIdForGuild,
} from "../src/index.js";
import { createManager, gatewayInformation, readyScript } from "./helpers.js";
import { MemoryStrategy } from "./memory.js";

describe("layout", () => {
  test("GIVEN a list of sizes THEN each shard gets its gateway shards", async () => {
    const { manager, strategy } = createManager(readyScript, { shards: [2, 1] });

    await manager.spawn();

    expect(manager.shardCount).toBe(3);
    expect(strategy.clients.map((client) => client.gatewayOptions)).toEqual([
      { shardIds: [0, 1], shardCount: 3 },
      { shardIds: [2], shardCount: 3 },
    ]);
    await manager.destroy();
  });

  test("GIVEN auto THEN Discord's recommendation is split across the clusters", async () => {
    const fetch = vi.fn(async () => gatewayInformation(5));
    const { manager } = createManager(readyScript, {
      shards: "auto",
      clusters: 2,
      gatewayInformation: { fetch },
      recommended: { multipleOf: 2 },
    });

    expect(manager.channels).toHaveLength(0);
    await manager.spawn();

    expect(manager.shardCount).toBe(6);
    expect(manager.channels.map((channel) => channel.shards)).toEqual([
      [0, 1, 2],
      [3, 4, 5],
    ]);
    expect(fetch).toHaveBeenCalledOnce();
    await manager.destroy();
  });

  test("GIVEN a shard list THEN only those gateway shards are spawned, out of the total", () => {
    const { manager } = createManager(readyScript, {
      shards: [2, 2],
      totalShards: 8,
      shardList: [4, 5, 6, 7],
    });

    expect(manager.shardCount).toBe(8);
    expect(manager.channels.map((channel) => channel.shards)).toEqual([
      [4, 5],
      [6, 7],
    ]);
    expect(manager.channelFor(6)?.id).toBe(1);
  });

  test("GIVEN invalid layouts THEN the constructor throws", () => {
    expect(() => createManager(readyScript, { shards: [2, 0] })).toThrow(RangeError);
    expect(() => createManager(readyScript, { shards: 2, shardList: [0, 0] })).toThrow(RangeError);
    expect(() =>
      createManager(readyScript, { shards: 2, totalShards: 4, shardList: [3, 4] }),
    ).toThrow(RangeError);
    expect(() => createManager(readyScript, { supervisor: { intensity: -2 } })).toThrow(RangeError);
  });

  test("GIVEN a guild THEN channelForGuild finds the shard connecting it", () => {
    const { manager } = createManager(readyScript, { shards: [2, 2] });
    const guildId = "81384788765712384";

    expect(manager.channelForGuild(guildId)?.shards).toContain(shardIdForGuild(guildId, 4));
  });
});

describe("registries", () => {
  test("GIVEN a strategy name THEN it is built with the strategy options", () => {
    expect(new ShardManager({ shards: 1 }).strategy).toBeInstanceOf(ForkStrategy);
    const worker = new ShardManager({
      shards: 1,
      strategy: "worker",
      strategyOptions: { path: "./bot.js" },
    }).strategy;
    expect(worker).toBeInstanceOf(WorkerStrategy);
    expect(() => new ShardManager({ shards: 1, strategy: "carrier-pigeon" })).toThrow(RangeError);

    const strategy = new MemoryStrategy(readyScript);
    registerStrategy("memory", () => strategy);
    expect(new ShardManager({ shards: 1, strategy: "memory" }).strategy).toBe(strategy);
  });

  test("GIVEN a token THEN the shards get it, with the codec's names", async () => {
    const { manager, strategy } = createManager(readyScript, {
      shards: 1,
      token: "Bot secret",
      messageHandler: "v8",
      transformers: ["gzip"],
    });

    await manager.spawn();

    expect(strategy.spawned[0]!.options.env).toEqual({ DISCORD_TOKEN: "Bot secret" });
    expect(strategy.spawned[0]!.context).toMatchObject({
      messageHandler: "v8",
      transformers: ["gzip"],
    });
    await manager.destroy();
  });
});

describe("lifecycle", () => {
  test("GIVEN a crash or a restart signal THEN the shard is respawned", async () => {
    const { manager, strategy } = createManager(
      (client, spawns) => {
        void client.ready().then(() => (spawns === 1 ? client.restart() : undefined));
      },
      { shards: 1 },
    );
    const restarts: number[] = [];
    manager.on("shardRestart", (channel) => restarts.push(channel.id));
    await manager.spawn();

    strategy.crash(0, 1);
    await expect.poll(() => strategy.clients.length).toBe(3);
    await manager.channels[0]!.waitForReady();

    expect(restarts).toEqual([0, 0]);
    await manager.destroy();
  });

  test("GIVEN more crashes than the intensity THEN the supervisor gives up", async () => {
    const { manager, strategy } = createManager(readyScript, {
      shards: 1,
      supervisor: { intensity: 1, period: 60_000 },
    });
    const givenUp: number[] = [];
    manager.on("shardGiveUp", (_channel, crashes) => givenUp.push(crashes));
    await manager.spawn();

    strategy.crash(0, 1);
    await manager.channels[0]!.waitForReady();
    strategy.crash(0, 1);

    expect(givenUp).toEqual([2]);
    expect(manager.channels[0]!.stopped).toBe(true);
    await expect(manager.send(0, "awoo")).rejects.toBeInstanceOf(ShardUnavailableError);
  });

  test("GIVEN one-for-all THEN a crash restarts every shard", async () => {
    const { manager, strategy } = createManager(readyScript, {
      shards: 3,
      supervisor: { strategy: "one-for-all" },
    });
    await manager.spawn();

    strategy.crash(1, 1);
    await expect.poll(() => strategy.clients.length).toBe(6);
    await Promise.all(manager.channels.map((channel) => channel.waitForReady()));

    await manager.destroy();
  });

  test("GIVEN rest-for-one THEN a crash restarts the shards after it", async () => {
    const { manager, strategy } = createManager(readyScript, {
      shards: 3,
      supervisor: { strategy: "rest-for-one" },
    });
    await manager.spawn();

    strategy.crash(1, 1);
    await expect.poll(() => strategy.clients.length).toBe(5);
    await Promise.all(manager.channels.map((channel) => channel.waitForReady()));

    expect(
      strategy.clients
        .slice(3)
        .map((client) => client.id)
        .toSorted(),
    ).toEqual([1, 2]);
    await manager.destroy();
  });

  test("GIVEN exit() THEN the shard is not respawned", async () => {
    const { manager, strategy } = createManager(readyScript, { shards: 1 });
    await manager.spawn();

    await strategy.clients[0]!.exit();

    expect(manager.channels[0]!.status).toBe(ShardStatus.Idle);
    expect(manager.channels[0]!.stopped).toBe(true);
    expect(strategy.clients).toHaveLength(1);
  });

  test("GIVEN disconnected and reconnecting signals THEN they are emitted, and messages wait", async () => {
    const { manager, strategy } = createManager(readyScript, { shards: 1 });
    const events: string[] = [];
    manager.on("shardDisconnect", () => events.push("disconnect"));
    manager.on("shardReconnecting", () => events.push("reconnecting"));
    const received: unknown[] = [];
    await manager.spawn();
    const client = strategy.clients[0]!;
    client.on("message", (body) => received.push(body));

    await client.disconnected();
    await expect.poll(() => manager.channels[0]!.status).toBe(ShardStatus.Disconnected);
    const sent = manager.send(0, "awoo");
    await client.reconnecting();
    await client.ready();
    await sent;

    expect(events).toEqual(["disconnect", "reconnecting"]);
    await expect.poll(() => received).toEqual(["awoo"]);
    await manager.destroy();
  });

  test("GIVEN restart THEN the close handler runs and the shard comes back", async () => {
    const closed: number[] = [];
    const { manager, strategy } = createManager(
      (client) => {
        client.setCloseHandler(() => {
          closed.push(client.id);
        });
        void client.ready();
      },
      { shards: 1 },
    );
    const destroyed: number[] = [];
    manager.on("shardDestroy", (channel) => destroyed.push(channel.id));
    await manager.spawn();

    await manager.restart(0);

    expect(closed).toEqual([0]);
    expect(destroyed).toEqual([0]);
    expect(strategy.clients).toHaveLength(2);
    expect(manager.channels[0]!.ready).toBe(true);
    await manager.destroy();
  });

  test("GIVEN a rolling restart THEN the old shard closes only once the new one is ready", async () => {
    const order: string[] = [];
    const { manager, strategy } = createManager(
      (client, spawns) => {
        client.setCloseHandler(() => {
          order.push(`close ${spawns}`);
        });
        setTimeout(() => {
          order.push(`ready ${spawns}`);
          void client.ready();
        }, 10);
      },
      { shards: 1 },
    );
    await manager.spawn();

    await manager.restart(0, { rolling: true });

    expect(order).toEqual(["ready 0", "ready 1", "close 0"]);
    expect(strategy.clients).toHaveLength(2);
    expect(manager.channels[0]!.ready).toBe(true);
    expect(await manager.request(0, null).catch(() => "no handler")).toBe("no handler");
    await manager.destroy();
  });

  test("GIVEN reshard THEN the new layout runs before the old one closes", async () => {
    const { manager, strategy } = createManager(readyScript, {
      shards: 2,
      gatewayInformation: { fetch: async () => gatewayInformation(4) },
    });
    await manager.spawn();
    const previous = manager.channels;

    await manager.reshard({ shards: "auto", clusters: 2 });

    expect(manager.shardCount).toBe(4);
    expect(manager.channels.map((channel) => channel.shards)).toEqual([
      [0, 1],
      [2, 3],
    ]);
    expect(previous.every((channel) => channel.stopped && !channel.running)).toBe(true);
    expect(strategy.clients.slice(2).map((client) => client.shardCount)).toEqual([4, 4]);
    await manager.destroy();
  });

  test("GIVEN a shard never ready THEN spawn gives up once the supervisor does", async () => {
    let spawned = 0;
    const { manager } = createManager(
      () => {
        spawned++;
      },
      { shards: 1, supervisor: { intensity: 1 }, spawn: { delay: 0, timeout: 20 } },
    );

    await expect(manager.spawn()).rejects.toBeInstanceOf(ShardUnavailableError);
    expect(spawned).toBe(2);
  });

  test("GIVEN a shard exiting before it is ready THEN shardError carries a ShardSpawnError", async () => {
    const { manager } = createManager(
      (client, spawns) => {
        if (spawns === 0) void client.exit(3);
        else void client.ready();
      },
      { shards: 1 },
    );
    const errors: unknown[] = [];
    manager.on("shardError", (_channel, error) => errors.push(error));

    await manager.spawn();

    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(ShardSpawnError);
    expect(errors[0]).toMatchObject({ code: 3 });
    await manager.destroy();
  });

  test("GIVEN a ready hint THEN a request past it fails early and a slow start is reported", async () => {
    const { manager, strategy } = createManager(() => undefined, {
      shards: 1,
      spawn: { delay: 0, timeout: 5_000, readyHint: 300, readyHintMargin: 0 },
    });
    const slow: number[] = [];
    manager.on("shardSlowStart", (_channel, _elapsed, estimate) => slow.push(estimate));
    const spawning = manager.spawn();
    await expect.poll(() => strategy.clients.length).toBe(1);

    await expect(manager.request(0, null, { timeout: 20 })).rejects.toThrow(/expected to be ready/);
    await expect.poll(() => slow).toEqual([300]);
    await strategy.clients[0]!.ready();
    await spawning;
    await manager.destroy();
  });

  test("GIVEN pings THEN the latency is measured, and a silent shard is unresponsive", async () => {
    const { manager, strategy } = createManager(readyScript, {
      shards: 1,
      ping: { interval: 5, timeout: 100 },
    });
    const latencies: number[] = [];
    const unresponsive: number[] = [];
    manager.on("shardPing", (_channel, latency) => latencies.push(latency));
    manager.on("shardUnresponsive", (channel) => unresponsive.push(channel.id));
    await manager.spawn();

    await expect.poll(() => latencies.length).toBeGreaterThan(0);
    expect(manager.channels[0]!.ping.latency).toBeGreaterThanOrEqual(0);
    expect(strategy.clients[0]!.lastPingTimestamp).not.toBeNull();

    strategy.mute(0);
    await expect.poll(() => unresponsive, { timeout: 2_000 }).toEqual([0]);
    await manager.destroy();
  });
});
