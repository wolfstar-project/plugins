import { describe, expect, test } from "vitest";
import {
  GzipTransformer,
  JsonMessageHandler,
  ShardManager,
  ShardRequestError,
  ShardRequestTimeoutError,
  ShardStatus,
  ShardUnavailableError,
  V8MessageHandler,
  shardIdForGuild,
  type ShardManagerOptions,
} from "../src/index.js";
import { PacketCodec, Op } from "../src/messages/protocol.js";
import { MemoryStrategy, type ShardScript } from "./memory.js";

const readyScript: ShardScript = (client) => void client.ready();

function createManager(
  script: ShardScript,
  options: Partial<ShardManagerOptions> = {},
): { manager: ShardManager; strategy: MemoryStrategy } {
  const strategy = new MemoryStrategy(script);
  const manager = new ShardManager({
    strategy,
    shards: 2,
    spawn: { delay: 0, timeout: 1_000 },
    requestTimeout: 1_000,
    ...options,
  });
  return { manager, strategy };
}

describe("ShardManager", () => {
  test("GIVEN a layout THEN each shard gets its gateway shards", async () => {
    const { manager, strategy } = createManager(readyScript, { shards: [2, 1] });
    const ready: number[] = [];
    manager.on("shardReady", (shard) => ready.push(shard.id));

    await manager.spawn();

    expect(manager.shardCount).toBe(3);
    expect(ready).toEqual([0, 1]);
    expect(strategy.clients.map((client) => client.gatewayOptions)).toEqual([
      { shardIds: [0, 1], shardCount: 3 },
      { shardIds: [2], shardCount: 3 },
    ]);
    expect(manager.shards.every((shard) => shard.status === ShardStatus.Ready)).toBe(true);
    await manager.destroy();
  });

  test("GIVEN an invalid layout THEN the constructor throws", () => {
    expect(() => createManager(readyScript, { shards: [2, 0] })).toThrow(RangeError);
    expect(() => createManager(readyScript, { respawns: -2 })).toThrow(RangeError);
  });

  test("GIVEN a guild THEN shardForGuild finds the shard connecting it", () => {
    const { manager } = createManager(readyScript, { shards: [2, 2] });
    const guildId = "81384788765712384";

    expect(manager.shardForGuild(guildId).shards).toContain(shardIdForGuild(guildId, 4));
  });
});

describe("messages and requests", () => {
  test("GIVEN requests both ways THEN each handler answers", async () => {
    const { manager } = createManager((client) => {
      client.setRequestHandler((body: number, { from }) => ({
        id: client.id,
        doubled: body * 2,
        from,
      }));
      void client.ready().then(async () => {
        await client.send(await client.request({ from: client.id }));
      });
    });
    manager.setRequestHandler(
      (body: { from: number }, { shard }) => `hello ${body.from} ${shard.id}`,
    );
    const messages: unknown[] = [];
    manager.on("message", (body) => messages.push(body));

    await manager.spawn();
    const replies = await manager.broadcastRequest(21);
    await expect.poll(() => messages.length).toBe(2);

    expect(replies).toEqual([
      { id: 0, doubled: 42, from: null },
      { id: 1, doubled: 42, from: null },
    ]);
    expect(messages.toSorted()).toEqual(["hello 0 0", "hello 1 1"]);
    await manager.destroy();
  });

  test("GIVEN a shard messaging and asking another THEN the manager carries both", async () => {
    const received: [number, unknown, number | null][] = [];
    const { manager, strategy } = createManager((client) => {
      client.on("message", (body, from) => received.push([client.id, body, from]));
      client.setRequestHandler(() => client.id * 10);
      void client.ready();
    });

    await manager.spawn();
    const [first] = strategy.clients;
    await first!.send("awoo", 1);
    await first!.send("all", "all");
    const reply = await first!.request({}, { to: 1 });
    const replies = await first!.broadcastRequest({});
    await expect.poll(() => received.length).toBe(3);

    expect(reply).toBe(10);
    expect(replies).toEqual([0, 10]);
    expect(received).toEqual(
      expect.arrayContaining([
        [1, "awoo", 0],
        [0, "all", 0],
        [1, "all", 0],
      ]),
    );
    await manager.destroy();
  });

  test("GIVEN a failing or missing handler THEN the request rejects with the remote error", async () => {
    const { manager } = createManager((client) => {
      if (client.id === 0) {
        client.setRequestHandler(() => {
          throw new TypeError("No howling");
        });
      }

      void client.ready();
    });

    await manager.spawn();

    await expect(manager.request(0, null)).rejects.toMatchObject({
      name: "ShardRequestError",
      remoteName: "TypeError",
      message: "No howling",
    });
    await expect(manager.request(1, null)).rejects.toBeInstanceOf(ShardRequestError);
    await manager.destroy();
  });

  test("GIVEN a request past its timeout THEN it rejects and the handler is aborted", async () => {
    let aborted = false;
    const { manager } = createManager((client) => {
      client.setRequestHandler(
        (_body, { signal }) =>
          new Promise((resolve) => {
            signal.addEventListener("abort", () => {
              aborted = true;
              resolve(null);
            });
          }),
      );
      void client.ready();
    });

    await manager.spawn();

    await expect(manager.request(0, null, { timeout: 20 })).rejects.toBeInstanceOf(
      ShardRequestTimeoutError,
    );
    await expect.poll(() => aborted).toBe(true);
    await manager.destroy();
  });

  test("GIVEN an aborted signal THEN the request rejects with its reason", async () => {
    const { manager } = createManager((client) => {
      client.setRequestHandler(() => new Promise(() => undefined));
      void client.ready();
    });
    await manager.spawn();
    const controller = new AbortController();

    const request = manager.request(0, null, { signal: controller.signal });
    controller.abort(new Error("Never mind"));

    await expect(request).rejects.toThrow("Never mind");
    await manager.destroy();
  });

  test("GIVEN a gzip and V8 codec THEN packets keep their types", async () => {
    const codec = new PacketCodec(new V8MessageHandler(), [new GzipTransformer()]);
    const body = new Map([["moon", new Date(0)]]);

    const packet = await codec.decode(await codec.encode({ op: Op.Message, body }));

    expect(packet).toEqual({ op: Op.Message, body });
    await expect(new PacketCodec(new JsonMessageHandler(), []).decode('{"op":99}')).rejects.toThrow(
      TypeError,
    );
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
    manager.on("shardRestart", (shard) => restarts.push(shard.id));
    await manager.spawn();

    strategy.crash(0, 1);
    await expect.poll(() => strategy.clients.length).toBe(3);
    await manager.shards[0]!.waitForReady();

    expect(restarts).toEqual([0, 0]);
    expect(manager.shards[0]!.ready).toBe(true);
    await manager.destroy();
  });

  test("GIVEN a crash without respawns left THEN the shard stays down", async () => {
    let spawned = 0;
    const { manager, strategy } = createManager(
      (client) => {
        spawned++;
        void client.ready();
      },
      { shards: 1, respawns: 0 },
    );
    const exits: (number | null)[] = [];
    manager.on("shardExit", (_shard, code) => exits.push(code));

    await manager.spawn();
    strategy.crash(0, 7);

    expect(exits).toEqual([7]);
    expect(spawned).toBe(1);
    await expect(manager.send(0, "awoo")).rejects.toBeInstanceOf(ShardUnavailableError);
  });

  test("GIVEN exit() THEN the shard is not respawned", async () => {
    const { manager, strategy } = createManager(readyScript, { shards: 1 });
    await manager.spawn();

    await strategy.clients[0]!.exit();

    expect(manager.shards[0]!.status).toBe(ShardStatus.Idle);
    expect(manager.shards[0]!.stopped).toBe(true);
    expect(strategy.clients).toHaveLength(1);
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
    manager.on("shardDestroy", (shard) => destroyed.push(shard.id));
    await manager.spawn();

    await manager.restart(0);

    expect(closed).toEqual([0]);
    expect(destroyed).toEqual([0]);
    expect(strategy.clients).toHaveLength(2);
    expect(manager.shards[0]!.ready).toBe(true);
    await manager.destroy();
  });

  test("GIVEN a shard never ready THEN spawn gives up after its respawns", async () => {
    let spawned = 0;
    const { manager } = createManager(
      () => {
        spawned++;
      },
      { shards: 1, respawns: 1, spawn: { delay: 0, timeout: 20 } },
    );

    await expect(manager.spawn()).rejects.toBeInstanceOf(ShardUnavailableError);
    expect(spawned).toBe(2);
  });

  test("GIVEN a ready shard not pinging THEN shardUnresponsive is emitted", async () => {
    const { manager } = createManager(readyScript, {
      shards: 1,
      ping: { interval: 60_000, timeout: 20 },
    });
    const unresponsive: number[] = [];
    manager.on("shardUnresponsive", (shard) => unresponsive.push(shard.id));

    await manager.spawn();

    await expect.poll(() => unresponsive).toEqual([0]);
    await manager.destroy();
  });

  test("GIVEN pings THEN the client measures its latency", async () => {
    const { manager, strategy } = createManager(readyScript, {
      shards: 1,
      ping: { interval: 5, timeout: 1_000 },
    });
    const pings: number[] = [];
    manager.on("shardPing", (shard) => pings.push(shard.id));

    await manager.spawn();

    await expect.poll(() => strategy.clients[0]!.latency).not.toBeNull();
    expect(pings[0]).toBe(0);
    expect(manager.shards[0]!.lastPingTimestamp).not.toBeNull();
    await manager.destroy();
  });
});
