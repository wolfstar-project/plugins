// Type-level test, checked by the root `typecheck` script through `tsconfig.consumption.json`: the broker must
// accept the `ioredis` clients as they are, without any cast.
import type { Cluster, Redis } from "ioredis";
import { BrokerConsumer, createBroker, type BrokerRedisClientLike } from "../../src/index.js";

declare const redis: Redis;
declare const cluster: Cluster;

export const client: BrokerRedisClientLike = redis;
export const clusterClient: BrokerRedisClientLike = cluster;
export const broker = createBroker({ redis, stream: "events" });
export const consumer = new BrokerConsumer({
  redis: cluster,
  stream: "events",
  group: "workers",
  consumer: "worker-1",
});

export const consumerWithClaims = new BrokerConsumer({
  redis,
  stream: "events",
  group: "workers",
  consumer: "worker-1",
  claimIdle: 60_000,
  maxDeliveries: 5,
  shutdownSignals: ["SIGTERM", "SIGINT"],
});
