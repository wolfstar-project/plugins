import cluster, { type ClusterSettings, type Worker as ClusterWorker } from "node:cluster";
import { fileURLToPath } from "node:url";
import {
  ShardContextVariable,
  encodeContext,
  type ShardContext,
  type SpawnOptions,
} from "./ChannelStrategy.js";
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
  public readonly name = "cluster";
  public readonly options: ClusterStrategyOptions;

  public constructor(options: ClusterStrategyOptions = {}) {
    super();
    this.options = options;
  }

  protected createProcess(context: ShardContext, options: SpawnOptions): ClusterWorker {
    const { path, args, execArgv, env } = this.options;
    // An explicit `undefined` would override Node's defaults, so only the given keys are set.
    const settings: ClusterSettings = { serialization: "advanced" };
    if (path) settings.exec = path instanceof URL ? fileURLToPath(path) : path;
    if (args) settings.args = [...args];
    if (execArgv) settings.execArgv = [...execArgv];
    cluster.setupPrimary(settings);
    return cluster.fork({ ...env, ...options.env, [ShardContextVariable]: encodeContext(context) });
  }
}
