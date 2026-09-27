import {
  container,
  postListen,
  preGenericsInitialization,
  type Client,
  type ClientOptions,
} from "@wolfstar/http-framework";
import { afterEach, describe, expect, test } from "vitest";
import { BrokerConsumer } from "../src/index.js";
import { BrokerPlugin } from "../src/register.js";
import { FakeStreamRedis } from "./fixtures/FakeStreamRedis.js";

function run(options: Partial<ClientOptions>): ClientOptions {
  const resolved = options as ClientOptions;
  // Neither hook touches `this`, so a stand-in is enough to exercise them without booting a client.
  BrokerPlugin[preGenericsInitialization].call({} as Client, resolved);
  return resolved;
}

describe("BrokerPlugin", () => {
  afterEach(async () => {
    await container.broker?.stop();
    container.broker = undefined;
  });

  test("GIVEN no broker option THEN nothing is installed", () => {
    run({});

    expect(container.broker).toBeUndefined();
  });

  test("GIVEN a broker option THEN a BrokerConsumer is installed", () => {
    run({
      broker: { redis: new FakeStreamRedis(), stream: "events", group: "g", consumer: "c1" },
    });

    expect(container.broker).toBeInstanceOf(BrokerConsumer);
  });

  test("GIVEN an installed broker THEN postListen starts it", async () => {
    const redis = new FakeStreamRedis();
    run({ broker: { redis, stream: "events", group: "g", consumer: "c1" } });

    // The group does not exist yet: reading through it rejects with NOGROUP.
    await expect(
      redis.xreadgroup("GROUP", "g", "c1", "COUNT", 1, "STREAMS", "events", "0"),
    ).rejects.toThrow("NOGROUP");

    await BrokerPlugin[postListen].call({} as Client, {} as ClientOptions);

    // postListen's `start()` created the group: the same read now resolves instead of rejecting.
    await expect(
      redis.xreadgroup("GROUP", "g", "c1", "COUNT", 1, "STREAMS", "events", "0"),
    ).resolves.toBeNull();
  });
});
