// Type-level test, checked by the root `typecheck` script through `tsconfig.consumption.json`: the Redis cache must
// accept the `ioredis` clients as they are, without any cast.
import type { Cluster, Redis } from "ioredis";
import {
  createRedisCache,
  createRedisSessionStore,
  type RedisClientLike,
} from "../../src/index.js";

declare const redis: Redis;
declare const cluster: Cluster;

export const client: RedisClientLike = redis;
export const clusterClient: RedisClientLike = cluster;
export const cache = createRedisCache({ redis, compression: "gzip", ttl: { guilds: 60 } });
export const sessionStore = createRedisSessionStore({ redis, ttl: 60 });
export const clusterSessionStore = createRedisSessionStore({ redis: cluster });
