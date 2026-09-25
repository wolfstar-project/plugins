/// <reference types="node" />

export * from "./ShardChannel.js";
export * from "./ShardClient.js";
export * from "./ShardManager.js";
export * from "./ShardManagerProxy.js";
export * from "./ShardPing.js";
export * from "./messages/MessageHandler.js";
export * from "./messages/MessageTransformer.js";
export { ShardStatus, type ControlRequest, type ShardTarget } from "./messages/protocol.js";
export * from "./strategies/ChannelStrategy.js";
export * from "./strategies/ClusterStrategy.js";
export * from "./strategies/ForkStrategy.js";
export * from "./strategies/NetworkStrategy.js";
export * from "./strategies/ProcessStrategy.js";
export * from "./strategies/WorkerStrategy.js";
export { registerStrategy, resolveStrategy } from "./strategies/registry.js";
export * from "./util/commands.js";
export * from "./util/errors.js";
export {
  fetchGatewayInformation,
  fetchRecommendedShardCount,
  resolveRecommendedShardCount,
  shardIdForGuild,
  type GatewayInformation,
  type RecommendedShardCountOptions,
} from "./util/gateway.js";
export type { BroadcastRequestOptions, RequestHandler, RequestOptions } from "./util/requests.js";
export type { SupervisorOptions, SupervisorStrategy } from "./util/Supervisor.js";
