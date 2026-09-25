import { describe, expect, test } from "vitest";
import {
  ClusterStrategy,
  ForkStrategy,
  GzipTransformer,
  ShardManager,
  WorkerStrategy,
  type ChannelStrategy,
} from "../src/index.js";

const script = new URL("fixtures/shard.mjs", import.meta.url);
// Node 22 needs the flag to strip types, Node 24 strips them by default.
const execArgv = ["--experimental-strip-types", "--no-warnings"];

interface Reply {
  id: number;
  shards: number[];
  pid: number;
  threadId: number;
  body: unknown;
}

const strategies: [name: string, create: () => ChannelStrategy][] = [
  ["ForkStrategy", () => new ForkStrategy({ path: script, execArgv })],
  ["ClusterStrategy", () => new ClusterStrategy({ path: script, execArgv })],
  ["WorkerStrategy", () => new WorkerStrategy({ path: script, worker: { execArgv } })],
];

describe.each(strategies)("%s", (name, create) => {
  test(
    "GIVEN two shards THEN they spawn, answer, echo, and close",
    { timeout: 30_000 },
    async () => {
      const manager = new ShardManager({
        strategy: create(),
        shards: [2, 1],
        spawn: { delay: 0, timeout: 20_000 },
        requestTimeout: 5_000,
      });

      try {
        await manager.spawn();
        const replies = await manager.broadcastRequest<Reply>("awoo");
        const echo = new Promise((resolve) => manager.once("message", resolve));
        await manager.send(1, "howl");

        expect(replies.map(({ id, shards, body }) => ({ id, shards, body }))).toEqual([
          { id: 0, shards: [0, 1], body: "awoo" },
          { id: 1, shards: [2], body: "awoo" },
        ]);
        if (name === "WorkerStrategy") {
          expect(replies.every(({ pid, threadId }) => pid === process.pid && threadId > 0)).toBe(
            true,
          );
        } else {
          expect(new Set(replies.map(({ pid }) => pid)).size).toBe(2);
          expect(replies.every(({ pid }) => pid !== process.pid)).toBe(true);
        }

        expect(await echo).toEqual({ echo: "howl", from: null });
      } finally {
        await manager.destroy();
      }

      expect(manager.shards.every((shard) => !shard.running)).toBe(true);
    },
  );
});

test(
  "GIVEN mismatched transformers THEN the shard's messages are invalid",
  { timeout: 30_000 },
  async () => {
    const manager = new ShardManager({
      strategy: new ForkStrategy({ path: script, execArgv }),
      shards: 1,
      spawn: { delay: 0, timeout: 500 },
      respawns: 0,
      transformers: [new GzipTransformer()],
    });
    const invalid: unknown[] = [];
    manager.on("shardInvalidMessage", (_shard, error) => invalid.push(error));

    await expect(manager.spawn()).rejects.toThrow(/not ready/);
    expect(invalid.length).toBeGreaterThan(0);
  },
);
