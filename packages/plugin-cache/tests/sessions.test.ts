import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  CacheValueError,
  createRedisSessionStore,
  DefaultRedisSessionStorePrefix,
  RedisSessionStore,
  type GatewaySessionInfo,
} from "../src/index.js";
import { FakeRedis } from "../../../tests/fixtures/FakeRedis.js";

const session: GatewaySessionInfo = {
  resumeURL: "wss://gateway-us-east1-b.discord.gg",
  sequence: 42,
  sessionId: "a1b2c3",
  shardCount: 2,
  shardId: 1,
};

describe("RedisSessionStore", () => {
  let redis: FakeRedis;

  beforeEach(() => {
    redis = new FakeRedis();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("GIVEN a session THEN it is stored per shard and read back", async () => {
    const store = createRedisSessionStore({ redis, prefix: "bot:sessions" });

    await store.set(1, session);

    expect(await store.get(1)).toEqual(session);
    expect(await store.get(0)).toBeNull();
    expect(JSON.parse(redis.strings.get("bot:sessions:1")!.value)).toEqual(session);
  });

  test("GIVEN null THEN the session is dropped", async () => {
    const store = createRedisSessionStore({ redis });

    await store.set(1, session);
    await store.set(1, null);

    expect(await store.get(1)).toBeNull();
    expect(redis.strings.size).toBe(0);
  });

  test("GIVEN the default ttl THEN sessions expire 10 minutes after their last write", async () => {
    vi.useFakeTimers();
    const store = createRedisSessionStore({ redis });

    await store.set(1, session);
    vi.advanceTimersByTime(9 * 60_000);
    await store.set(1, { ...session, sequence: 43 });
    vi.advanceTimersByTime(9 * 60_000);
    expect(await store.get(1)).toEqual({ ...session, sequence: 43 });

    vi.advanceTimersByTime(60_000);
    expect(await store.get(1)).toBeNull();
  });

  test("GIVEN a null ttl THEN sessions never expire", async () => {
    const store = createRedisSessionStore({ redis, ttl: null });

    await store.set(1, session);

    expect(redis.strings.get(`${DefaultRedisSessionStorePrefix}:1`)!.expiresAt).toBe(Infinity);
  });

  test("GIVEN an invalid ttl THEN it throws", () => {
    expect(() => new RedisSessionStore({ redis, ttl: 0 })).toThrow(RangeError);
  });

  test("GIVEN invalid JSON THEN get rejects with a CacheValueError naming the key", async () => {
    const store = createRedisSessionStore({ redis });
    await redis.set("wolfstar:sessions:1", "{not json");

    const error = await store.get(1).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(CacheValueError);
    expect((error as CacheValueError).key).toBe("wolfstar:sessions:1");
  });

  test("GIVEN a Redis outage THEN the client's error propagates unwrapped", async () => {
    const store = createRedisSessionStore({ redis });
    const outage = new Error("ECONNREFUSED");
    redis.failure = outage;

    await expect(store.get(1)).rejects.toBe(outage);
    await expect(store.set(1, session)).rejects.toBe(outage);
    await expect(store.set(1, null)).rejects.toBe(outage);
  });
});
