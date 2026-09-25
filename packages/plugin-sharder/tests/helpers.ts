import { ShardManager, type GatewayInformation, type ShardManagerOptions } from "../src/index.js";
import { MemoryStrategy, type ShardScript } from "./memory.js";

export const readyScript: ShardScript = (client) => void client.ready();

export function gatewayInformation(shards = 4, maxConcurrency = 1): GatewayInformation {
  return {
    url: "wss://gateway.discord.gg",
    shards,
    session_start_limit: {
      total: 1000,
      remaining: 1000,
      reset_after: 86_400_000,
      max_concurrency: maxConcurrency,
    },
  };
}

export function createManager(
  script: ShardScript,
  options: Partial<ShardManagerOptions> = {},
): { manager: ShardManager; strategy: MemoryStrategy } {
  const strategy = new MemoryStrategy(script);
  const manager = new ShardManager({
    strategy,
    shards: 2,
    spawn: { delay: 0, timeout: 1_000 },
    requestTimeout: 1_000,
    ...options,
  });
  return { manager, strategy };
}
