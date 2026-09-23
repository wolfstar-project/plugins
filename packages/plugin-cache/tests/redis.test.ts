import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createRedisCache, RedisEntityCache, type RedisClientLike } from "../src/index.js";

function score(value: string | number): number {
  if (value === "+inf") return Infinity;
  if (value === "-inf") return -Infinity;
  return Number(value);
}

/**
 * A minimal in-memory Redis, honouring `PX` expirations through `Date.now()`.
 */
class FakeRedis implements RedisClientLike {
  public readonly strings = new Map<string, { value: string; expiresAt: number }>();
  public readonly sortedSets = new Map<string, Map<string, number>>();

  public async get(key: string) {
    return this.read(key);
  }

  public async mget(...keys: string[]) {
    return keys.map((key) => this.read(key));
  }

  public async set(key: string, value: string, _mode?: "PX", milliseconds?: number) {
    this.strings.set(key, {
      value,
      expiresAt: milliseconds === undefined ? Infinity : Date.now() + milliseconds,
    });
    return "OK";
  }

  public async del(...keys: string[]) {
    let deleted = 0;
    for (const key of keys) {
      if ((this.read(key) !== null && this.strings.delete(key)) || this.sortedSets.delete(key))
        deleted++;
    }
    return deleted;
  }

  public async exists(...keys: string[]) {
    return keys.filter((key) => this.read(key) !== null).length;
  }

  public async zadd(key: string, ...scoreMembers: (string | number)[]) {
    const set = this.sortedSet(key);
    for (let index = 0; index < scoreMembers.length; index += 2) {
      set.set(String(scoreMembers[index + 1]), score(scoreMembers[index]!));
    }
    return scoreMembers.length / 2;
  }

  public async zrem(key: string, ...members: string[]) {
    const set = this.sortedSet(key);
    return members.filter((member) => set.delete(member)).length;
  }

  public async zrange(key: string, _start: string, _stop: string) {
    return [...this.sortedSet(key).entries()]
      .toSorted(([, a], [, b]) => a - b)
      .map(([member]) => member);
  }

  public async zcard(key: string) {
    return this.sortedSet(key).size;
  }

  public async zremrangebyscore(key: string, min: number | string, max: number | string) {
    const set = this.sortedSet(key);
    let removed = 0;
    for (const [member, value] of set) {
      if (value >= score(min) && value <= score(max)) {
        set.delete(member);
        removed++;
      }
    }
    return removed;
  }

  private read(key: string): string | null {
    const entry = this.strings.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.strings.delete(key);
      return null;
    }
    return entry.value;
  }

  private sortedSet(key: string) {
    let set = this.sortedSets.get(key);
    if (!set) this.sortedSets.set(key, (set = new Map()));
    return set;
  }
}

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
