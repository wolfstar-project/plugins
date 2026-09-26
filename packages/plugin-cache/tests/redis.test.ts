import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { GatewayDispatchEvents, type GatewayDispatchPayload } from "discord-api-types/v10";
import {
  applyGatewayDispatch,
  CacheValueError,
  createRedisCache,
  memberKey,
  messageKey,
  RedisEntityCache,
} from "../src/index.js";
import { FakeRedis } from "../../../tests/fixtures/FakeRedis.js";

describe("RedisEntityCache", () => {
  let redis: FakeRedis;

  beforeEach(() => {
    redis = new FakeRedis();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("GIVEN entries THEN it behaves like a Map", async () => {
    const cache = new RedisEntityCache<{ id: string }>(redis, { prefix: "test" });

    await cache.set("1", { id: "1" });
    await cache.set("2", { id: "2" });

    expect(await cache.get("1")).toEqual({ id: "1" });
    expect(await cache.has("2")).toBe(true);
    expect(await cache.getSize()).toBe(2);
    expect((await cache.keys()).toSorted()).toEqual(["1", "2"]);
    expect(await cache.entries()).toHaveLength(2);
    expect(redis.strings.has("test:1")).toBe(true);

    expect(await cache.delete("1")).toBe(true);
    expect(await cache.delete("1")).toBe(false);
    expect(await cache.getSize()).toBe(1);

    await cache.clear();
    expect(await cache.getSize()).toBe(0);
    expect(redis.strings.size).toBe(0);
  });

  test("GIVEN a ttl THEN entries expire", async () => {
    vi.useFakeTimers();
    const cache = new RedisEntityCache<number>(redis, { prefix: "test", ttl: 10 });

    await cache.set("a", 1);
    vi.advanceTimersByTime(5_000);
    await cache.set("b", 2);
    vi.advanceTimersByTime(6_000);

    expect(await cache.get("a")).toBeUndefined();
    expect(await cache.get("b")).toBe(2);
    expect(await cache.keys()).toEqual(["b"]);
    expect(await cache.getSize()).toBe(1);
  });

  test("GIVEN an invalid ttl THEN it throws", () => {
    expect(() => new RedisEntityCache(redis, { prefix: "test", ttl: 0 })).toThrow(RangeError);
  });

  test.each(["gzip", "brotli"] as const)(
    "GIVEN %s compression THEN large values are compressed and read back",
    async (compression) => {
      const cache = new RedisEntityCache<{ content: string }>(redis, {
        prefix: "test",
        compression,
        compressionThreshold: 16,
      });
      const value = { content: "a".repeat(4096) };

      await cache.set("large", value);
      await cache.set("small", { content: "a" });

      const stored = redis.strings.get("test:large")!.value;
      expect(stored.length).toBeLessThan(JSON.stringify(value).length);
      expect(redis.strings.get("test:small")!.value).toBe('{"content":"a"}');
      expect(await cache.get("large")).toEqual(value);
      expect(await cache.values()).toHaveLength(2);
    },
  );

  test("GIVEN values written without compression THEN a compressing cache still reads them", async () => {
    const plain = new RedisEntityCache<string>(redis, { prefix: "test" });
    const compressed = new RedisEntityCache<string>(redis, {
      prefix: "test",
      compression: "gzip",
      compressionThreshold: 0,
    });

    await plain.set("a", "plain");
    await compressed.set("b", "compressed");

    expect(await compressed.get("a")).toBe("plain");
    expect(await plain.get("b")).toBe("compressed");
  });
});

describe("RedisEntityCache failures", () => {
  let redis: FakeRedis;

  beforeEach(() => {
    redis = new FakeRedis();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("GIVEN a ttl THEN every write prunes expired index entries, even without reads", async () => {
    vi.useFakeTimers();
    const cache = new RedisEntityCache<number>(redis, { prefix: "test", ttl: 10 });

    await cache.set("a", 1);
    vi.advanceTimersByTime(11_000);
    await cache.set("b", 2);

    expect([...redis.sortedSets.get("test:@index")!.keys()]).toEqual(["b"]);
  });

  test("GIVEN a Redis outage THEN the client's error propagates unwrapped", async () => {
    const cache = new RedisEntityCache<number>(redis, { prefix: "test" });
    const outage = new Error("ECONNREFUSED");
    redis.failure = outage;

    await expect(cache.get("a")).rejects.toBe(outage);
    await expect(cache.set("a", 1)).rejects.toBe(outage);
    await expect(cache.delete("a")).rejects.toBe(outage);
  });

  test("GIVEN an aborted transaction THEN set rejects instead of silently skipping the write", async () => {
    const cache = new RedisEntityCache<number>(redis, { prefix: "test" });
    redis.abortTransactions = true;

    await expect(cache.set("a", 1)).rejects.toThrow("aborted");
    expect(redis.strings.size).toBe(0);
  });

  test("GIVEN invalid JSON THEN get rejects with a CacheValueError naming the key", async () => {
    const cache = new RedisEntityCache<number>(redis, { prefix: "test" });
    await redis.set("test:a", "{not json");

    const error = await cache.get("a").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(CacheValueError);
    expect((error as CacheValueError).key).toBe("test:a");
    expect((error as CacheValueError).cause).toBeInstanceOf(SyntaxError);
  });

  test.each(["gz:", "br:"])(
    "GIVEN corrupt %s compressed bytes THEN get and entries reject with a CacheValueError",
    async (marker) => {
      const cache = new RedisEntityCache<number>(redis, { prefix: "test" });
      await redis.set("test:a", `${marker}bm90IGNvbXByZXNzZWQ=`);
      await redis.zadd("test:@index", "+inf", "a");

      await expect(cache.get("a")).rejects.toBeInstanceOf(CacheValueError);
      await expect(cache.entries()).rejects.toBeInstanceOf(CacheValueError);
    },
  );

  test("GIVEN a missing value THEN get resolves to undefined rather than rejecting", async () => {
    const cache = new RedisEntityCache<number>(redis, { prefix: "test" });

    await expect(cache.get("missing")).resolves.toBeUndefined();
  });
});

describe("RedisEntityCache guild index", () => {
  let redis: FakeRedis;

  beforeEach(() => {
    redis = new FakeRedis();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function indexedCache(ttl?: number) {
    return new RedisEntityCache<{ guild_id?: string }>(redis, {
      prefix: "test",
      ttl,
      guildOf: (_key, value) => value?.guild_id,
    });
  }

  test("GIVEN guildOf THEN deleteGuild drops that guild's entries only", async () => {
    const cache = indexedCache();
    await cache.set("1", { guild_id: "10" });
    await cache.set("2", { guild_id: "10" });
    await cache.set("3", { guild_id: "11" });
    await cache.set("4", {});

    expect(await cache.deleteGuild("10")).toBe(2);

    expect((await cache.keys()).toSorted()).toEqual(["3", "4"]);
    expect(await cache.get("1")).toBeUndefined();
    expect(await redis.zcard("test:@guild:10")).toBe(0);
    expect(await redis.zcard("test:@guild:11")).toBe(1);
  });

  test("GIVEN a deleted entry THEN it leaves its guild index", async () => {
    const cache = indexedCache();
    await cache.set("1", { guild_id: "10" });

    await cache.delete("1");
    expect(await redis.zcard("test:@guild:10")).toBe(0);

    await cache.set("1", { guild_id: "10" });
    expect(await cache.deleteGuild("10")).toBe(1);
  });

  test("GIVEN a guild resolvable from the key THEN delete does not read the value", async () => {
    const cache = new RedisEntityCache<{ id: string }>(redis, {
      prefix: "test",
      guildOf: (key) => key.split(":")[0],
    });
    await cache.set("10:1", { id: "1" });
    const get = vi.spyOn(redis, "get");

    await cache.delete("10:1");

    expect(get).not.toHaveBeenCalled();
    expect(await redis.zcard("test:@guild:10")).toBe(0);
  });

  test("GIVEN no guildOf THEN deleteGuild resolves to null", async () => {
    const cache = new RedisEntityCache<{ guild_id?: string }>(redis, { prefix: "test" });
    await cache.set("1", { guild_id: "10" });

    expect(await cache.deleteGuild("10")).toBeNull();
    expect(await cache.has("1")).toBe(true);
  });

  test("GIVEN a ttl THEN the guild index expires with its entries", async () => {
    vi.useFakeTimers();
    const cache = indexedCache(10);
    await cache.set("1", { guild_id: "10" });

    vi.advanceTimersByTime(11_000);

    expect(await redis.zcard("test:@guild:10")).toBe(0);
    expect(await redis.zcard("test:@guilds")).toBe(0);
  });

  test("GIVEN clear THEN the guild indexes are dropped too", async () => {
    const cache = indexedCache();
    await cache.set("1", { guild_id: "10" });
    await cache.set("2", { guild_id: "11" });

    await cache.clear();

    expect(await redis.zcard("test:@guild:10")).toBe(0);
    expect(await redis.zcard("test:@guild:11")).toBe(0);
    expect(await redis.zcard("test:@guilds")).toBe(0);
  });
});

const guildDelete = (id: string) =>
  ({ op: 0, s: 1, t: GatewayDispatchEvents.GuildDelete, d: { id } }) as GatewayDispatchPayload;

async function seed(
  cache: ReturnType<typeof createRedisCache>,
  guildId: string,
  channelId: string,
) {
  await cache.channels.set(channelId, { id: channelId, type: 0, guild_id: guildId } as never);
  await cache.members.set(memberKey(guildId, "1"), {
    user: { id: "1" },
    guild_id: guildId,
  } as never);
  // Values keyed by guild are indexed through their key even without a `guild_id`.
  await cache.roles.set(`${guildId}:2`, { id: "2" } as never);
  await cache.messages.set(messageKey(channelId, "3"), {
    id: "3",
    channel_id: channelId,
    guild_id: guildId,
  } as never);
}

describe("createRedisCache guild index", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("GIVEN a GUILD_DELETE THEN the guild's data is dropped through the index, without a scan", async () => {
    const cache = createRedisCache({ redis: new FakeRedis() });
    await seed(cache, "10", "20");
    await seed(cache, "11", "21");
    const entries = vi.spyOn(RedisEntityCache.prototype, "entries");
    const keys = vi.spyOn(RedisEntityCache.prototype, "keys");

    await applyGatewayDispatch(cache, guildDelete("10"));

    expect(entries).not.toHaveBeenCalled();
    expect(keys).not.toHaveBeenCalled();
    expect(await cache.channels.has("20")).toBe(false);
    expect(await cache.members.has(memberKey("10", "1"))).toBe(false);
    expect(await cache.roles.has("10:2")).toBe(false);
    expect(await cache.messages.has(messageKey("20", "3"))).toBe(false);
    expect(await cache.channels.has("21")).toBe(true);
    expect(await cache.members.has(memberKey("11", "1"))).toBe(true);
    expect(await cache.roles.has("11:2")).toBe(true);
    expect(await cache.messages.has(messageKey("21", "3"))).toBe(true);
  });

  test("GIVEN indexGuilds false THEN a GUILD_DELETE falls back to scanning", async () => {
    const cache = createRedisCache({ redis: new FakeRedis(), indexGuilds: false });
    await seed(cache, "10", "20");
    await seed(cache, "11", "21");
    const entries = vi.spyOn(RedisEntityCache.prototype, "entries");

    await applyGatewayDispatch(cache, guildDelete("10"));

    expect(entries).toHaveBeenCalled();
    expect(await cache.channels.has("20")).toBe(false);
    expect(await cache.roles.has("10:2")).toBe(false);
    expect(await cache.messages.has(messageKey("20", "3"))).toBe(false);
    expect(await cache.channels.has("21")).toBe(true);
  });
});

describe("createRedisCache", () => {
  test("GIVEN options THEN every entity cache is namespaced and configured", () => {
    const cache = createRedisCache({
      redis: new FakeRedis(),
      prefix: "bot",
      compression: "gzip",
      ttl: { users: 60 },
    });

    expect(cache.users.prefix).toBe("bot:users");
    expect(cache.users.ttl).toBe(60);
    expect(cache.users.compression).toBe("gzip");
    expect(cache.guilds.prefix).toBe("bot:guilds");
    expect(cache.guilds.ttl).toBeUndefined();
  });

  test("GIVEN no prefix THEN the default one is used", () => {
    expect(createRedisCache({ redis: new FakeRedis() }).messages.prefix).toBe(
      "wolfstar:cache:messages",
    );
  });
});
