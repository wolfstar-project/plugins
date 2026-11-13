import { describe, expect, test, vi } from "vitest";
import { ShardClient, type ClientTransport } from "../src/index.js";
import { createManager, readyScript } from "./helpers.js";

describe("ShardClient#addExitHook", () => {
  test("GIVEN exit() THEN the hooks run in order before the manager sees the shard stop", async () => {
    const order: string[] = [];
    const { manager, strategy } = createManager(
      (client) => {
        client.addExitHook(() => order.push("first"));
        client.addExitHook(async () => {
          order.push("second");
        });
        void client.ready();
      },
      { shards: 1 },
    );
    manager.on("shardExit", () => order.push("shardExit"));
    await manager.spawn();

    await strategy.clients[0]!.exit();

    await expect.poll(() => order).toEqual(["first", "second", "shardExit"]);
    expect(manager.channels[0]!.stopped).toBe(true);
    await manager.destroy();
  });

  test("GIVEN a close from the manager THEN the hooks run once the close handler resolved", async () => {
    const order: string[] = [];
    const { manager } = createManager(
      (client, spawns) => {
        if (spawns > 0) return void client.ready();
        client.setCloseHandler(() => order.push("close"));
        client.addExitHook(() => order.push("exit hook"));
        void client.ready();
      },
      { shards: 1 },
    );
    await manager.spawn();

    await manager.restart(0);

    expect(order).toEqual(["close", "exit hook"]);
    await manager.destroy();
  });

  test("GIVEN a failing hook THEN it is reported, the next hooks run and the shard still stops", async () => {
    const failure = new Error("flush failed");
    const errors: unknown[] = [];
    const next = vi.fn();
    const { manager, strategy } = createManager(
      (client) => {
        client.on("error", (error) => errors.push(error));
        client.addExitHook(() => {
          throw failure;
        });
        client.addExitHook(next);
        void client.ready();
      },
      { shards: 1 },
    );
    await manager.spawn();

    await strategy.clients[0]!.exit();

    expect(errors).toEqual([failure]);
    expect(next).toHaveBeenCalledTimes(1);
    await expect.poll(() => manager.channels[0]!.stopped).toBe(true);
    await manager.destroy();
  });

  test("GIVEN a removed hook THEN the shard stops without running it", async () => {
    const hook = vi.fn();
    const { manager, strategy } = createManager(
      (client) => {
        client.addExitHook(hook)();
        void client.ready();
      },
      { shards: 1 },
    );
    await manager.spawn();

    await strategy.clients[0]!.exit();

    expect(hook).not.toHaveBeenCalled();
    await manager.destroy();
  });

  test("GIVEN the manager is gone and nothing listens to disconnect THEN the hooks run before the shard exits", async () => {
    const { manager, strategy } = createManager(readyScript, { shards: 1 });
    await manager.spawn();
    const { context } = strategy.spawned[0]!;

    const order: string[] = [];
    let disconnect: () => void = () => undefined;
    const transport: ClientTransport = {
      send: async () => undefined,
      onMessage: () => undefined,
      onDisconnect: (listener) => {
        disconnect = listener;
      },
      exit: (code) => order.push(`exit ${code}`),
    };
    const client = new ShardClient({ context, transport });
    client.addExitHook(async () => {
      order.push("hook");
    });

    disconnect();

    await expect.poll(() => order).toEqual(["hook", "exit 0"]);
    await manager.destroy();
  });
});

describe("overlapping stops", () => {
  test("GIVEN the manager going away during exit() THEN the hooks run once and the shard exits after them", async () => {
    const { manager, strategy } = createManager(readyScript, { shards: 1 });
    await manager.spawn();
    const { context } = strategy.spawned[0]!;

    const order: string[] = [];
    let disconnect: () => void = () => undefined;
    const transport: ClientTransport = {
      send: async () => undefined,
      onMessage: () => undefined,
      onDisconnect: (listener) => {
        disconnect = listener;
      },
      exit: (code) => order.push(`exit ${code}`),
    };
    const client = new ShardClient({ context, transport });
    let release: () => void = () => undefined;
    const hook = vi.fn(async () => {
      order.push("flush start");
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      order.push("flush end");
    });
    client.addExitHook(hook);

    const exiting = client.exit();
    disconnect();
    await Promise.resolve();
    expect(order).toEqual(["flush start"]);
    release();
    await exiting;

    await expect.poll(() => order).toEqual(["flush start", "flush end", "exit 0", "exit 0"]);
    expect(hook).toHaveBeenCalledTimes(1);
    await manager.destroy();
  });
});

describe("ShardManager#addDestroyHook", () => {
  test("GIVEN hooks THEN they run in order once the shards are closed", async () => {
    const { manager } = createManager(readyScript, { shards: 1 });
    const order: string[] = [];
    manager.on("shardExit", () => order.push("shardExit"));
    manager.addDestroyHook(() => order.push("first"));
    manager.addDestroyHook(async () => {
      order.push("second");
    });
    await manager.spawn();

    await manager.destroy();

    expect(order).toEqual(["shardExit", "first", "second"]);
  });

  test("GIVEN closing a shard fails THEN the hooks still run and destroy rejects", async () => {
    const { manager } = createManager(readyScript, { shards: 1 });
    await manager.spawn();
    const failure = new Error("close failed");
    vi.spyOn(manager.channels[0]!, "close").mockRejectedValue(failure);
    const hook = vi.fn();
    manager.addDestroyHook(hook);

    await expect(manager.destroy()).rejects.toBe(failure);
    expect(hook).toHaveBeenCalledTimes(1);
  });

  test("GIVEN one shard failing to close THEN the hooks wait for the others to close", async () => {
    const { manager } = createManager(readyScript, { shards: 2 });
    await manager.spawn();
    const [first, second] = manager.channels;
    const failure = new Error("close failed");
    const order: string[] = [];
    vi.spyOn(first!, "close").mockRejectedValue(failure);
    const close = second!.close.bind(second);
    vi.spyOn(second!, "close").mockImplementation(async (...args) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      await close(...args);
      order.push("second closed");
    });
    manager.addDestroyHook(() => order.push("hook"));

    await expect(manager.destroy()).rejects.toBe(failure);
    expect(order).toEqual(["second closed", "hook"]);
  });

  test("GIVEN a failing hook THEN it is reported and the next hooks still run", async () => {
    const { manager } = createManager(readyScript, { shards: 1 });
    const errors: unknown[] = [];
    manager.on("error", (error) => errors.push(error));
    const failure = new Error("flush failed");
    const next = vi.fn();
    manager.addDestroyHook(() => {
      throw failure;
    });
    manager.addDestroyHook(next);
    const remove = manager.addDestroyHook(vi.fn());
    remove();
    await manager.spawn();

    await manager.destroy();

    expect(errors).toEqual([failure]);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
