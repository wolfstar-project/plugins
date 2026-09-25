import type { ChildProcess } from "node:child_process";
import type { Worker as ClusterWorker } from "node:cluster";
import type {
  ChannelStrategy,
  ShardContext,
  ShardTransport,
  ShardTransportEvents,
  SpawnOptions,
} from "./ChannelStrategy.js";

/**
 * The options shared by the strategies spawning processes.
 */
export interface ProcessStrategyOptions {
  /**
   * The arguments passed to the shard's script.
   */
  args?: readonly string[];
  /**
   * The arguments passed to Node.js, e.g. `["--enable-source-maps"]`.
   */
  execArgv?: readonly string[];
  /**
   * Extra environment variables, on top of the manager's own.
   */
  env?: NodeJS.ProcessEnv;
}

/**
 * The base of {@link ForkStrategy} and {@link ClusterStrategy}: a shard is a process with an IPC channel, using the
 * `advanced` serialization so binary data (and {@link RawMessageHandler}'s values) survive it.
 */
export abstract class ProcessStrategy implements ChannelStrategy {
  public abstract readonly name: string;

  public spawn(
    context: ShardContext,
    events: ShardTransportEvents,
    options: SpawnOptions,
  ): ShardTransport {
    const child = this.createProcess({ ...context, transport: "process" }, options);
    // A cluster worker wraps its child process.
    const process: ChildProcess = "process" in child ? child.process : child;

    process.on("message", (data: unknown) => events.message(data));
    process.on("error", (error: unknown) => events.error(error));
    let exited = false;
    const exit = new Promise<void>((resolve) => {
      process.once("exit", (code) => {
        exited = true;
        events.exit(code);
        resolve();
      });
    });

    return {
      pid: process.pid ?? null,
      send: (data) =>
        new Promise((resolve, reject) => {
          if (!process.connected) {
            reject(new Error("The shard's IPC channel is closed"));
            return;
          }

          process.send(data as never, undefined, undefined, (error) =>
            error ? reject(error) : resolve(),
          );
        }),
      kill: async () => {
        if (!exited) process.kill();
        await exit;
      },
    };
  }

  protected abstract createProcess(
    context: ShardContext,
    options: SpawnOptions,
  ): ChildProcess | ClusterWorker;
}
