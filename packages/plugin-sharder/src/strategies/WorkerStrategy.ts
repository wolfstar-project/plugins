import { Worker, type WorkerOptions } from "node:worker_threads";
import type { ChannelData } from "../messages/MessageHandler.js";
import {
  ShardContextVariable,
  encodeContext,
  type ChannelStrategy,
  type ShardContext,
  type ShardTransport,
  type ShardTransportEvents,
} from "./ChannelStrategy.js";

/**
 * The options of {@link WorkerStrategy}.
 */
export interface WorkerStrategyOptions {
  /**
   * The script every shard runs.
   */
  path: string | URL;
  /**
   * Extra options of the `Worker`, e.g. its `resourceLimits`. `workerData` is reserved for the shard's context.
   */
  worker?: Omit<WorkerOptions, "workerData">;
}

/**
 * Spawns every shard as a worker thread of the manager's process. Messages are the fastest, but the shards share the
 * process: a crash of the process stops them all.
 */
export class WorkerStrategy implements ChannelStrategy {
  public readonly transport = "worker";
  public readonly options: WorkerStrategyOptions;

  public constructor(options: WorkerStrategyOptions) {
    this.options = options;
  }

  public spawn(context: ShardContext, events: ShardTransportEvents): ShardTransport {
    const worker = new Worker(this.options.path, {
      ...this.options.worker,
      workerData: { [ShardContextVariable]: encodeContext(context) },
    });

    worker.on("message", (data: ChannelData) => events.message(data));
    worker.on("error", (error) => events.error(error));
    const exit = new Promise<void>((resolve) => {
      worker.once("exit", (code) => {
        events.exit(code);
        resolve();
      });
    });

    return {
      send: async (data) => {
        // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker thread, not a window
        worker.postMessage(data);
      },
      kill: async () => {
        await worker.terminate();
        await exit;
      },
    };
  }
}
