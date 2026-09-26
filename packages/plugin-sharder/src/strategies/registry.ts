import type { ChannelStrategy } from "./ChannelStrategy.js";
import { ClusterStrategy, type ClusterStrategyOptions } from "./ClusterStrategy.js";
import { ForkStrategy, type ForkStrategyOptions } from "./ForkStrategy.js";
import { NetworkStrategy, type NetworkStrategyOptions } from "./NetworkStrategy.js";
import { WorkerStrategy, type WorkerStrategyOptions } from "./WorkerStrategy.js";

const strategies = new Map<string, (options: any) => ChannelStrategy>([
  ["fork", (options: ForkStrategyOptions) => new ForkStrategy(options)],
  ["cluster", (options: ClusterStrategyOptions) => new ClusterStrategy(options)],
  ["worker", (options: WorkerStrategyOptions) => new WorkerStrategy(options)],
  ["network", (options: NetworkStrategyOptions) => new NetworkStrategy(options)],
]);

/**
 * Registers a strategy under a name, so managers and proxies can be given its name, like the built-in `"fork"`,
 * `"cluster"`, `"worker"`, and `"network"`.
 *
 * @param name The name of the strategy.
 * @param factory Builds the strategy from the `strategyOptions`.
 */
export function registerStrategy<Options>(
  name: string,
  factory: (options: Options) => ChannelStrategy,
): void {
  strategies.set(name, factory);
}

/**
 * Resolves a strategy, or the name of a registered one.
 *
 * @param strategy The strategy, or its name.
 * @param options The options of a named strategy.
 */
export function resolveStrategy(
  strategy: ChannelStrategy | string,
  options?: unknown,
): ChannelStrategy {
  if (typeof strategy !== "string") return strategy;

  const factory = strategies.get(strategy);
  if (!factory) throw new RangeError(`There is no strategy named "${strategy}"`);
  return factory(options ?? {});
}
