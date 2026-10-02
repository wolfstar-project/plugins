import { Collection } from "@discordjs/collection";
import { createInMemoryCache } from "@wolfstar/plugin-cache";
import type { APIMessage, APIUser } from "discord-api-types/v10";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  cacheWithLimits,
  DefaultSweeperSettings,
  GatewayClient,
  GatewayErrorCodes,
  Sweepers,
  type GatewayClientOptions,
} from "../src/index.js";

const channelId = "100000000000000020";
const discordEpoch = 1_420_070_400_000n;

function createClient(options: Partial<GatewayClientOptions> = {}) {
  return new GatewayClient({
    discordPublicKey: "0".repeat(64),
    discordToken: "test-token",
    clientId: "266624760782258186",
    intents: 0,
    ...options,
  });
}

function rawUser(id: string, bot = false): APIUser {
  return { id, username: `user-${id}`, discriminator: "0", global_name: null, avatar: null, bot };
}

// A message created `ageSeconds` ago, edited `editedSecondsAgo` ago if given.
function rawMessage(
  id: string,
  ageSeconds: number,
  editedSecondsAgo?: number,
): Partial<APIMessage> {
  const created = BigInt(Date.now() - ageSeconds * 1_000);
  return {
    id: String((created - discordEpoch) << 22n) + "",
    channel_id: channelId,
    author: rawUser(id),
    content: id,
    mentions: [],
    mention_roles: [],
    edited_timestamp:
      editedSecondsAgo === undefined
        ? null
        : new Date(Date.now() - editedSecondsAgo * 1_000).toISOString(),
  };
}

// Timers a client holds on its own, which the sweepers' are counted on top of.
let perClient = 0;

function sweeperTimers(created: () => unknown) {
  const before = vi.getTimerCount();
  created();
  return vi.getTimerCount() - before - perClient;
}

beforeEach(() => {
  vi.useFakeTimers();
  const before = vi.getTimerCount();
  createClient();
  perClient = vi.getTimerCount() - before;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Sweepers on demand", () => {
  test("GIVEN a filter THEN sweep evicts what it selects, returns the count and emits cacheSweep", () => {
    const client = createClient();
    client.users.cache.add(rawUser("1", true));
    client.users.cache.add(rawUser("2"));
    client.users.cache.add(rawUser("3", true));
    const swept = vi.fn();
    client.on("cacheSweep", swept);

    const count = client.sweepers.sweepUsers(() => (user) => user.bot === true);

    expect(count).toBe(2);
    expect([...client.users.cache.keys()]).toEqual(["2"]);
    expect(swept).toHaveBeenCalledExactlyOnceWith("users", 2);
  });

  test("GIVEN a filter factory answering null THEN nothing is swept and no event is emitted", () => {
    const client = createClient();
    client.users.cache.add(rawUser("1"));
    const swept = vi.fn();
    client.on("cacheSweep", swept);

    expect(client.sweepers.sweepUsers(() => null)).toBe(0);
    expect(client.users.cache.size).toBe(1);
    expect(swept).not.toHaveBeenCalled();
  });

  test("GIVEN the factory THEN it runs once per sweep, and the filter gets the cache as its collection", () => {
    const client = createClient();
    client.users.cache.add(rawUser("1"));
    client.users.cache.add(rawUser("2"));
    const factory = vi.fn(() => vi.fn((_user, _key, collection) => collection === undefined));

    client.sweepers.sweepUsers(factory);

    expect(factory).toHaveBeenCalledTimes(1);
    const filter = factory.mock.results[0]!.value;
    expect(filter).toHaveBeenCalledTimes(2);
    expect(filter.mock.calls[0]![2]).toBeInstanceOf(Collection);
  });

  test("GIVEN messages of different ages THEN sweepMessages evicts the ones past the lifetime, counting edits", () => {
    const client = createClient();
    client.messages.cache.add(rawMessage("1", 7_200));
    client.messages.cache.add(rawMessage("2", 7_201, 60));
    client.messages.cache.add(rawMessage("3", 30));

    expect(client.sweepers.sweepMessages(3_600)).toBe(1);
    expect(client.messages.cache.size).toBe(2);
    expect(client.sweepers.sweepMessages(0)).toBe(0);
    expect(client.sweepers.sweepMessages()).toBe(0);
    expect(client.messages.cache.size).toBe(2);
  });

  test("GIVEN a client with no instance cache THEN sweeping evicts nothing", () => {
    const client = createClient({ cache: null });

    expect(client.sweepers.sweepUsers(() => () => true)).toBe(0);
  });

  test("GIVEN a store-backed cache THEN sweeping throws and the sweepers option conflicts", () => {
    const client = createClient({ cache: createInMemoryCache() });

    expect(() => client.sweepers.sweepUsers(() => () => true)).toThrow(
      expect.objectContaining({ code: GatewayErrorCodes.CacheNotIterable }),
    );
    expect(() =>
      createClient({
        cache: createInMemoryCache(),
        sweepers: { users: { interval: 60, filter: () => () => true } },
      }),
    ).toThrow(expect.objectContaining({ code: GatewayErrorCodes.ClientSweepersConflict }));
  });
});

describe("Sweepers scheduled", () => {
  test("GIVEN an interval THEN the sweeper runs on every tick, until the client is destroyed", async () => {
    let client!: GatewayClient;
    expect(
      sweeperTimers(() => {
        client = createClient({
          sweepers: { users: { interval: 60, filter: () => (user) => user.bot === true } },
        });
      }),
    ).toBe(1);

    client.users.cache.add(rawUser("1", true));
    expect(client.users.cache.size).toBe(1);
    vi.advanceTimersByTime(59_000);
    expect(client.users.cache.size).toBe(1);
    vi.advanceTimersByTime(1_000);
    expect(client.users.cache.size).toBe(0);

    client.users.cache.add(rawUser("2", true));
    vi.advanceTimersByTime(60_000);
    expect(client.users.cache.size).toBe(0);

    const timers = vi.getTimerCount();
    await client.destroy();
    expect(vi.getTimerCount()).toBeLessThan(timers);
    client.users.cache.add(rawUser("3", true));
    vi.advanceTimersByTime(120_000);
    expect(client.users.cache.size).toBe(1);
  });

  test("GIVEN a lifetime THEN the messages past it are swept on each tick", () => {
    const client = createClient({ sweepers: { messages: { interval: 60, lifetime: 600 } } });
    client.messages.cache.add(rawMessage("1", 0));

    vi.advanceTimersByTime(60_000);
    expect(client.messages.cache.size).toBe(1);
    vi.advanceTimersByTime(600_000);
    expect(client.messages.cache.size).toBe(0);
  });

  test("GIVEN a filter that throws THEN cacheError reports it and the next tick still runs", () => {
    let calls = 0;
    const error = new Error("boom");
    const client = createClient({
      sweepers: {
        users: {
          interval: 60,
          filter: () => {
            if (++calls === 1) throw error;
            return () => true;
          },
        },
      },
    });
    const failed = vi.fn();
    client.on("cacheError", failed);
    client.users.cache.add(rawUser("1"));

    vi.advanceTimersByTime(60_000);
    expect(failed).toHaveBeenCalledExactlyOnceWith(error, {
      entity: "users",
      key: null,
      operation: "sweep",
    });
    expect(client.users.cache.size).toBe(1);

    vi.advanceTimersByTime(60_000);
    expect(client.users.cache.size).toBe(0);
  });

  test("GIVEN a non-positive or infinite interval THEN nothing is scheduled", () => {
    const timers = sweeperTimers(() =>
      createClient({
        sweepers: {
          users: { interval: 0, filter: () => () => true },
          presences: { interval: -1, filter: () => () => true },
          voiceStates: { interval: Infinity, filter: () => () => true },
        },
      }),
    );

    expect(timers).toBe(0);
  });

  test("GIVEN cache: null THEN the sweepers option is ignored", () => {
    const timers = sweeperTimers(() =>
      createClient({
        cache: null,
        sweepers: { users: { interval: 60, filter: () => () => true } },
      }),
    );

    expect(timers).toBe(0);
  });

  test("GIVEN invalid options THEN the client throws", () => {
    const filter = () => () => true;

    expect(() =>
      createClient({ sweepers: { users: { interval: "60" as never, filter } } }),
    ).toThrow(TypeError);
    expect(() => createClient({ sweepers: { users: { interval: 60 } as never } })).toThrow(
      TypeError,
    );
    expect(() =>
      createClient({ sweepers: { users: { interval: 60, lifetime: 60 } as never } }),
    ).toThrow(TypeError);
    expect(() =>
      createClient({ sweepers: { messages: { interval: 60, lifetime: "60" as never } } }),
    ).toThrow(TypeError);
    expect(() => createClient({ sweepers: { users: { interval: 2 ** 31, filter } } })).toThrow(
      RangeError,
    );
  });

  test("GIVEN a later entity with invalid options THEN no timer of an earlier one is left running", () => {
    expect(
      sweeperTimers(() => {
        expect(() =>
          createClient({
            sweepers: {
              messages: { interval: 60, lifetime: 600 },
              users: { interval: "60" as never, filter: () => () => true },
            },
          }),
        ).toThrow(TypeError);
      }),
    ).toBe(0);
  });

  test("GIVEN DefaultSweeperSettings THEN it schedules the messages and threads sweepers", () => {
    expect(sweeperTimers(() => createClient({ sweepers: DefaultSweeperSettings }))).toBe(2);
  });
});

describe("Sweepers.filterByLifetime", () => {
  const collection = new Collection<string, { createdTimestamp?: number | null }>();

  test("GIVEN entries THEN only the ones older than the lifetime are selected", () => {
    const filter = Sweepers.filterByLifetime({ lifetime: 60 })()!;

    expect(filter({ createdTimestamp: Date.now() - 61_000 }, "a", collection)).toBe(true);
    expect(filter({ createdTimestamp: Date.now() - 59_000 }, "a", collection)).toBe(false);
    expect(filter({ createdTimestamp: null }, "a", collection)).toBe(false);
    expect(filter({}, "a", collection)).toBe(false);
  });

  test("GIVEN getComparisonTimestamp and excludeFromSweep THEN they are honored", () => {
    const filter = Sweepers.filterByLifetime<{ at: number; keep?: boolean }>({
      lifetime: 1,
      getComparisonTimestamp: (entry) => entry.at,
      excludeFromSweep: (entry) => entry.keep === true,
    })()!;
    const old = Date.now() - 10_000;

    expect(filter({ at: old }, "a", new Collection())).toBe(true);
    expect(filter({ at: old, keep: true }, "a", new Collection())).toBe(false);
  });

  test("GIVEN a non-positive lifetime THEN the factory answers null, and a non-number lifetime throws", () => {
    expect(Sweepers.filterByLifetime({ lifetime: 0 })()).toBeNull();
    expect(Sweepers.filterByLifetime({ lifetime: -1 })()).toBeNull();
    expect(() => Sweepers.filterByLifetime({ lifetime: "1" as never })).toThrow(TypeError);
  });

  test("GIVEN threads THEN outdatedThreadSweepFilter only selects the ones archived past the lifetime", () => {
    const filter = Sweepers.outdatedThreadSweepFilter(60)()!;
    const thread = (archived: boolean, archiveTimestamp: number | null) =>
      ({ archived, archiveTimestamp }) as never;
    const old = Date.now() - 61_000;

    expect(filter(thread(true, old), "a", new Collection())).toBe(true);
    expect(filter(thread(true, Date.now()), "a", new Collection())).toBe(false);
    expect(filter(thread(false, old), "a", new Collection())).toBe(false);
  });
});

describe("keepOverLimit and cacheWithLimits", () => {
  test("GIVEN numbers and options THEN cacheWithLimits builds cacheOptions", () => {
    const keepOverLimit = () => true;

    expect(
      cacheWithLimits({ messages: 200, presences: 0, members: { maxSize: 5, keepOverLimit } }),
    ).toEqual({
      messages: { maxSize: 200 },
      presences: { maxSize: 0 },
      members: { maxSize: 5, keepOverLimit },
    });
  });

  test("GIVEN cacheOptions with keepOverLimit THEN the client's caches honor it", () => {
    const client = createClient({
      cacheOptions: cacheWithLimits({
        users: { maxSize: 2, keepOverLimit: (user) => user.bot === true },
      }),
    });
    client.users.cache.add(rawUser("1", true));
    client.users.cache.add(rawUser("2"));
    client.users.cache.add(rawUser("3"));

    expect([...client.users.cache.keys()]).toEqual(["1", "3"]);
  });
});
