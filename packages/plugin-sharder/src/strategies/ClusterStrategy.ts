import cluster, { type Worker as ClusterWorker } from "node:cluster";
import { fileURLToPath } from "node:url";
import { ShardContextVariable, encodeContext, type ShardContext } from "./ChannelStrategy.js";
import { ProcessStrategy, type ProcessStrategyOptions } from "./ProcessStrategy.js";

/**
 * The options of {@link ClusterStrategy}.
 */
export interface ClusterStrategyOptions extends ProcessStrategyOptions {
  /**
   * The script every shard runs. Defaults to the manager's own script, so one file handles both sides: check
   * `cluster.isPrimary` to tell them apart.
   */
  path?: string | URL;
}

/**
 * Spawns every shard as a `node:cluster` worker. Unlike {@link ForkStrategy}, the shards share the ports they listen
 * on, and the primary balances the connections between them.
 */
export class ClusterStrategy extends ProcessStrategy {
  public readonly options: ClusterStrategyOptions;

  public constructor(options: ClusterStrategyOptions = {}) {
    super();
    this.options = options;
  }

  protected createProcess(context: ShardContext): ClusterWorker {
    const { path, args, execArgv, env } = this.options;
    cluster.setupPrimary({
      exec: path instanceof URL ? fileURLToPath(path) : path,
      args: args ? [...args] : undefined,
      execArgv: execArgv ? [...execArgv] : undefined,
      serialization: "advanced",
    });
    return cluster.fork({ ...env, [ShardContextVariable]: encodeContext(context) });
  }
}
