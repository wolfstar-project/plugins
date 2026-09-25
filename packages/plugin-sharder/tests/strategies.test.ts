import { afterEach, describe, expect, test, vi } from "vitest";
import {
  ClusterStrategy,
  ForkStrategy,
  NetworkStrategy,
  ShardManager,
  ShardManagerProxy,
  WorkerStrategy,
  type ChannelStrategy,
} from "../src/index.js";

const script = new URL("fixtures/shard.mjs", import.meta.url);
// Node 22 needs the flag to strip types, Node 24 strips them by default.
const execArgv = ["--experimental-strip-types", "--no-warnings"];

interface Info {
  id: number;
  shards: number[];
  pid: number;
  threadId: number;
  token: string | null;
  body: unknown;
}

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const task of cleanup.splice(0).toReversed()) await task();
});

function track<Value extends { destroy(): Promise<void> }>(value: Value): Value {
  cleanup.push(() => value.destroy());
  return value;
}

const local: [name: string, create: () => ChannelStrategy][] = [
  ["ForkStrategy", () => new ForkStrategy({ path: script, execArgv })],
  ["ClusterStrategy", () => new ClusterStrategy({ path: script, execArgv })],
  ["WorkerStrategy", () => new WorkerStrategy({ path: script, worker: { execArgv } })],
];

describe.each(local)("%s", (name, create) => {
  test(
    "GIVEN two shards THEN they spawn, answer, echo, and close",
    { timeout: 30_000 },
    async () => {
      const manager = track(
        new ShardManager({
          strategy: create(),
          shards: [2, 1],
          token: "secret",
          spawn: { delay: 0, timeout: 20_000 },
          requestTimeout: 5_000,
        }),
      );

      await manager.spawn();
      const replies = await manager.broadcastRequest<Info>("awoo");
      const echo = new Promise((resolve) => manager.once("message", resolve));
      await manager.send(1, "howl");

      expect(replies.map(({ id, shards, body, token }) => ({ id, shards, body, token }))).toEqual([
        { id: 0, shards: [0, 1], body: "awoo", token: "secret" },
        { id: 1, shards: [2], body: "awoo", token: "secret" },
      ]);
      if (name === "WorkerStrategy") {
        expect(replies.every(({ pid, threadId }) => pid === process.pid && threadId > 0)).toBe(
          true,
        );
        expect(manager.channels[0]!.threadId).toBe(replies[0]!.threadId);
      } else {
        expect(new Set(replies.map(({ pid }) => pid)).size).toBe(2);
        expect(manager.channels[0]!.pid).toBe(replies[0]!.pid);
      }

      expect(await echo).toEqual({ echo: "howl", from: null });
      await manager.destroy();
      expect(manager.channels.every((channel) => !channel.running)).toBe(true);
    },
  );
});

test(
  "GIVEN mismatched transformers THEN the shard's messages are invalid",
  { timeout: 30_000 },
  async () => {
    const manager = track(
      new ShardManager({
        strategy: new ForkStrategy({ path: script, execArgv }),
        shards: 1,
        spawn: { delay: 0, timeout: 500 },
        supervisor: { intensity: 0 },
        transformers: ["gzip"],
      }),
    );
    const invalid: unknown[] = [];
    manager.on("shardInvalidMessage", (_channel, error) => invalid.push(error));

    // The shard reads the manager's transformers from its context: tamper with them to force a mismatch.
    const spawn = manager.strategy.spawn.bind(manager.strategy);
    vi.spyOn(manager.strategy, "spawn").mockImplementation((context, events, options) =>
      spawn({ ...context, transformers: [] }, events, options),
    );

    await expect(manager.spawn()).rejects.toThrow(/not ready/);
    expect(invalid.length).toBeGreaterThan(0);
  },
);

describe("NetworkStrategy", () => {
  function createNetwork(options: { grace?: number; managerLoss?: "keep" | "exit" } = {}) {
    const strategy = new NetworkStrategy({
      port: 0,
      host: "127.0.0.1",
      token: "hunter2",
      reconnectGrace: options.grace ?? 5_000,
    });
    const manager = track(
      new ShardManager({
        strategy,
        shards: 2,
        spawn: { delay: 0, timeout: 20_000 },
        requestTimeout: 5_000,
      }),
    );
    const proxy = (token = "hunter2") =>
      track(
        new ShardManagerProxy({
          managers: [`127.0.0.1:${strategy.port}`],
          token,
          name: "den",
          capacity: 4,
          strategy: new ForkStrategy({ path: script, execArgv }),
          reconnectDelay: 50,
          managerLoss: options.managerLoss,
        }),
      );
    return { strategy, manager, proxy };
  }

  test(
    "GIVEN a proxy THEN its shards answer, and talk to each other locally",
    { timeout: 30_000 },
    async () => {
      const { strategy, manager, proxy } = createNetwork();
      await strategy.init();
      await proxy().connect();

      await manager.spawn();
      const replies = await manager.broadcastRequest<Info>("awoo");
      const forward = vi.spyOn(manager, "forward");
      const hello = await manager.request(0, { type: "ask", to: 1 });

      expect(replies.map(({ id, body }) => ({ id, body }))).toEqual([
        { id: 0, body: "awoo" },
        { id: 1, body: "awoo" },
      ]);
      expect(hello).toBe("hello 0 from 1");
      expect(forward).not.toHaveBeenCalled();
      expect(strategy.proxies).toEqual([
        { name: "den", host: expect.any(String), capacity: 4, load: 2 },
      ]);
      expect(manager.channels[0]!.host).toBe("den");
      expect(manager.channels[0]!.pid).toBe(replies[0]!.pid);
    },
  );

  test("GIVEN no proxy yet THEN the spawns wait for one", { timeout: 30_000 }, async () => {
    const { strategy, manager, proxy } = createNetwork();
    await strategy.init();

    const spawning = manager.spawn();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(manager.channels.every((channel) => !channel.ready)).toBe(true);
    await proxy().connect();
    await spawning;

    expect(manager.channels.every((channel) => channel.ready)).toBe(true);
  });

  test("GIVEN a wrong token THEN the proxy is rejected", { timeout: 30_000 }, async () => {
    const { strategy, proxy } = createNetwork();
    await strategy.init();
    const intruder = proxy("wrong");
    const rejected = new Promise((resolve) =>
      intruder.once("reject", (_manager, reason) => resolve(reason)),
    );

    void intruder.connect();

    expect(await rejected).toBe("Unauthorized");
    expect(strategy.proxies).toEqual([]);
  });

  test(
    "GIVEN a proxy reconnecting within the grace THEN its shards are kept",
    { timeout: 30_000 },
    async () => {
      const { strategy, manager, proxy } = createNetwork();
      await strategy.init();
      const den = proxy();
      await den.connect();
      await manager.spawn();
      const before = await manager.broadcastRequest<Info>(null);
      const exits: number[] = [];
      manager.on("shardExit", (channel) => exits.push(channel.id));

      const reconnected = new Promise((resolve) => den.once("connect", resolve));
      expect(strategy.disconnectProxy("den")).toBe(true);
      await reconnected;
      const after = await manager.broadcastRequest<Info>(null);

      expect(after.map(({ pid }) => pid)).toEqual(before.map(({ pid }) => pid));
      expect(exits).toEqual([]);
    },
  );

  test(
    "GIVEN a proxy lost past the grace THEN its shards are respawned elsewhere",
    { timeout: 30_000 },
    async () => {
      const { strategy, manager, proxy } = createNetwork({ grace: 200, managerLoss: "exit" });
      await strategy.init();
      const den = proxy();
      await den.connect();
      await manager.spawn();
      const before = await manager.broadcastRequest<Info>(null);
      const exits: (number | null)[] = [];
      manager.on("shardExit", (_channel, code) => exits.push(code));
      manager.on("shardError", () => undefined);

      await den.destroy();
      await expect.poll(() => exits.length, { timeout: 5_000 }).toBe(2);
      await proxy().connect();
      await Promise.all(manager.channels.map((channel) => channel.waitForReady(20_000)));
      const after = await manager.broadcastRequest<Info>(null);

      expect(after.map(({ pid }) => pid)).not.toEqual(before.map(({ pid }) => pid));
    },
  );
});
