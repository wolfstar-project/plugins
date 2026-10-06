import type { GatewayClient } from "../GatewayClient.js";

/**
 * The ID of the shard a guild lives on, `(guildId >> 22) % shardCount`.
 *
 * @internal
 */
export async function shardIdOf(client: GatewayClient, guildId: string): Promise<number> {
  const shardCount = BigInt(await client.gateway.getShardCount());
  return Number((BigInt(guildId) >> 22n) % shardCount);
}
