import { fork, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  ShardContextVariable,
  encodeContext,
  type ShardContext,
  type SpawnOptions,
} from "./ChannelStrategy.js";
import { ProcessStrategy, type ProcessStrategyOptions } from "./ProcessStrategy.js";

/**
 * The options of {@link ForkStrategy}.
 */
export interface ForkStrategyOptions extends ProcessStrategyOptions {
  /**
   * The script every shard runs. Defaults to the manager's own script: check {@link ShardClient.context} to tell the
   * manager and the shards apart.
   */
  path?: string | URL;
}

/**
 * Spawns every shard as a child process with `child_process.fork`. The default strategy.
 *
 * @remarks
 * Every shard is its own process: ports opened by the shards (e.g. an HTTP interactions server) must differ.
 */
export class ForkStrategy extends ProcessStrategy {
  public readonly name = "fork";
  public readonly options: ForkStrategyOptions;

  public constructor(options: ForkStrategyOptions = {}) {
    super();
    this.options = options;
  }

  protected createProcess(context: ShardContext, options: SpawnOptions): ChildProcess {
    const { path = process.argv[1]!, args = [], execArgv, env } = this.options;
    return fork(path instanceof URL ? fileURLToPath(path) : path, args, {
      env: {
        ...process.env,
        ...env,
        ...options.env,
        [ShardContextVariable]: encodeContext(context),
      },
      execArgv: execArgv ? [...execArgv] : undefined,
      serialization: "advanced",
    });
  }
}
