import { describe, expect, test } from "vitest";
import {
  GzipTransformer,
  JsonMessageHandler,
  RawMessageHandler,
  ShardClient,
  ShardManager,
  ShardRequestError,
  ShardRequestTimeoutError,
  V8MessageHandler,
  command,
  createCommandHandler,
  type ChannelData,
  type CommandReply,
  type MessageTransformer,
  type TransformerContext,
} from "../src/index.js";
import { Op, PacketCodec } from "../src/messages/protocol.js";
import { createManager, gatewayInformation, readyScript } from "./helpers.js";
import { MemoryStrategy } from "./memory.js";

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
      (body: { from: number }, { channel }) => `hello ${body.from} ${channel.id}`,
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
    const first = strategy.clients[0]!;
    await first.send("awoo", 1);
    await first.send("all", "all");
    const reply = await first.request({}, { to: 1 });
    const replies = await first.broadcastRequest({});
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

  test("GIVEN a partial broadcast THEN every outcome is kept", async () => {
    const { manager, strategy } = createManager((client) => {
      client.setRequestHandler(() => {
        if (client.id === 1) throw new TypeError("No howling");
        return client.id;
      });
      void client.ready();
    });
    await manager.spawn();

    const fromManager = await manager.broadcastRequest(null, { partial: true });
    const fromShard = await strategy.clients[0]!.broadcastRequest(null, { partial: true });

    for (const results of [fromManager, fromShard]) {
      expect(results[0]).toEqual({ status: "fulfilled", value: 0 });
      expect(results[1]).toMatchObject({ status: "rejected" });
      expect((results[1] as PromiseRejectedResult).reason).toBeInstanceOf(ShardRequestError);
    }

    await expect(manager.broadcastRequest(null)).rejects.toThrow("No howling");
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

  test("GIVEN an abort while the shard is not ready THEN the request never leaves the queue", async () => {
    const requests: unknown[] = [];
    const { manager, strategy } = createManager(
      (client) => {
        client.setRequestHandler((body) => requests.push(body));
      },
      { shards: 1 },
    );
    const spawning = manager.spawn();
    await expect.poll(() => strategy.clients.length).toBe(1);
    const controller = new AbortController();

    const request = manager.request(0, "queued", { signal: controller.signal });
    controller.abort(new Error("Never mind"));
    await expect(request).rejects.toThrow("Never mind");
    await strategy.clients[0]!.ready();
    await spawning;

    expect(requests).toEqual([]);
    await manager.destroy();
  });
});

describe("codec", () => {
  test("GIVEN V8 and gzip THEN packets keep their types", async () => {
    const codec = new PacketCodec(new V8MessageHandler(), [new GzipTransformer()]);
    const body = new Map([["moon", new Date(0)]]);

    const packet = await codec.decode(
      await codec.encode({ op: Op.Message, body }, { channelId: 0 }),
      {
        channelId: 0,
      },
    );

    expect(packet).toEqual({ op: Op.Message, body });
    await expect(
      new PacketCodec(new JsonMessageHandler(), []).decode('{"op":99}', { channelId: 0 }),
    ).rejects.toThrow(TypeError);
  });

  test("GIVEN the raw handler with transformers THEN the manager refuses it", () => {
    expect(new PacketCodec(new RawMessageHandler(), []).handler.name).toBe("raw");
    expect(
      () => new ShardManager({ shards: 1, messageHandler: "raw", transformers: ["gzip"] }),
    ).toThrow(TypeError);
  });

  test("GIVEN a custom transformer registered by name THEN both sides use it with their channel", async () => {
    const contexts: number[] = [];
    class Reverse implements MessageTransformer {
      public readonly name = "reverse";
      public write(data: ChannelData, context: TransformerContext) {
        contexts.push(context.channelId);
        return [...String(data)].toReversed().join("");
      }

      public read(data: ChannelData) {
        return [...String(data)].toReversed().join("");
      }
    }

    ShardClient.registerMessageTransformer("reverse", () => new Reverse());
    const { manager } = createManager(
      (client) => {
        client.setRequestHandler(() => "awoo");
        void client.ready();
      },
      { shards: [1, 1], transformers: ["reverse"] },
    );
    await manager.spawn();

    expect(await manager.request(1, null)).toBe("awoo");
    expect(new Set(contexts)).toEqual(new Set([0, 1]));
    await manager.destroy();
  });

  test("GIVEN commands THEN the handler dispatches them", async () => {
    const commands = {
      guildCount: () => 42,
      double: (value: number) => value * 2,
    };
    const { manager } = createManager((client) => {
      client.setRequestHandler(createCommandHandler(commands));
      void client.ready();
    });
    await manager.spawn();

    const counts = await manager.broadcastRequest<CommandReply<typeof commands, "guildCount">>(
      command<typeof commands>("guildCount"),
    );
    const doubled = await manager.request(0, command<typeof commands, "double">("double", 21));

    expect(counts).toEqual([42, 42]);
    expect(doubled).toBe(42);
    await expect(manager.request(0, { command: "toString" })).rejects.toThrow(/Unknown command/);
    await manager.destroy();
  });
});

describe("gateway shards", () => {
  test("GIVEN identifies THEN the manager hands out turns per bucket and counts them", async () => {
    const fetches: number[] = [];
    const { manager, strategy } = createManager(readyScript, {
      shards: [2, 2],
      gatewayInformation: {
        fetch: async () => {
          fetches.push(Date.now());
          return gatewayInformation(4, 2);
        },
      },
      identify: { delay: 60 },
    });
    await manager.spawn();
    const [first, second] = strategy.clients;
    const granted: [number, number][] = [];
    const started = Date.now();
    const controller = new AbortController();

    const identifies = [0, 1, 2, 3].map((shardId) =>
      (shardId < 2 ? first! : second!).identifyThrottler
        .waitForIdentify(shardId, shardId === 3 ? controller.signal : new AbortController().signal)
        .then(() => granted.push([shardId, Date.now() - started])),
    );
    controller.abort(new Error("Never mind"));
    await Promise.allSettled(identifies);
    const info = await first!.fetchGatewayInformation();

    // Buckets 0 (shards 0, 2) and 1 (shard 1) identify in parallel, shard 2 after the delay; shard 3 was aborted.
    expect(granted.map(([shardId]) => shardId).toSorted()).toEqual([0, 1, 2]);
    expect(granted.find(([shardId]) => shardId === 2)![1]).toBeGreaterThanOrEqual(50);
    expect(info.session_start_limit.remaining).toBe(997);
    expect(fetches).toHaveLength(1);
    await manager.destroy();
  });

  test("GIVEN a shard handler THEN the manager and the shards start and close gateway shards", async () => {
    const calls: string[] = [];
    const { manager, strategy } = createManager(
      (client) => {
        client.setShardHandler({
          start: (shardId) => calls.push(`start ${shardId}`),
          close: (shardId) => calls.push(`close ${shardId}`),
        });
        void client.ready();
      },
      { shards: [2, 2] },
    );
    await manager.spawn();

    await manager.restartShard(3);
    await strategy.clients[0]!.control({ action: "close", target: { shard: 2 } });

    expect(calls).toEqual(["close 3", "start 3", "close 2"]);
    await expect(manager.channels[0]!.startShard(3)).rejects.toThrow(/does not connect/);
    await manager.destroy();
  });

  test("GIVEN a control request to restart every shard THEN the manager restarts them", async () => {
    const { manager, strategy } = createManager(readyScript);
    await manager.spawn();

    await strategy.clients[0]!.control({ action: "restart", target: { channel: "all" } });
    await expect.poll(() => strategy.clients.length).toBe(4);
    await Promise.all(manager.channels.map((channel) => channel.waitForReady()));

    await manager.destroy();
  });

  test("GIVEN a shard started by a manager THEN ShardClient reads its context", () => {
    const strategy = new MemoryStrategy(readyScript);
    expect(ShardClient.context).toBeNull();
    expect(() => new ShardClient()).toThrow(/not spawned by a ShardManager/);
    expect(strategy.name).toBe("memory");
  });
});
