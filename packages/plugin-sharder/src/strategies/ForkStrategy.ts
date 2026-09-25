import { fork, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ShardContextVariable, encodeContext, type ShardContext } from "./ChannelStrategy.js";
import { ProcessStrategy, type ProcessStrategyOptions } from "./ProcessStrategy.js";

/**
 * The options of {@link ForkStrategy}.
 */
export interface ForkStrategyOptions extends ProcessStrategyOptions {
  /**
   * The script every shard runs.
   */
  path: string | URL;
}

/**
 * Spawns every shard as a child process with `child_process.fork`. The default strategy: the manager can be a small
 * script of its own, separate from the bot's.
 *
 * @remarks
 * Every shard is its own process: ports opened by the shards (e.g. an HTTP interactions server) must differ.
 */
export class ForkStrategy extends ProcessStrategy {
  public readonly options: ForkStrategyOptions;

  public constructor(options: ForkStrategyOptions) {
    super();
    this.options = options;
  }

  protected createProcess(context: ShardContext): ChildProcess {
    const { path, args = [], execArgv, env } = this.options;
    return fork(path instanceof URL ? fileURLToPath(path) : path, args, {
      env: { ...process.env, ...env, [ShardContextVariable]: encodeContext(context) },
      execArgv: execArgv ? [...execArgv] : undefined,
      serialization: "advanced",
    });
  }
}
