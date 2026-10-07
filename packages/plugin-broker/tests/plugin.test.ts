import { Client, container, type ClientOptions } from "@wolfstar/http-framework";
import { afterEach, describe, expect, test, vi } from "vitest";
import { BrokerConsumer } from "../src/BrokerConsumer";
import brokerPlugin from "../src/plugin";
import { FakeStreamRedis } from "./fixtures/FakeStreamRedis";

const base = { discordPublicKey: "a".repeat(64), discordToken: "token" };

function createClient(options: ConstructorParameters<typeof Client>[0]): Client {
  return new Client(options);
}

function validOptions(redis = new FakeStreamRedis()) {
  return { redis, stream: "events", group: "g", consumer: "c1" };
}

/**
 * Whether `group` exists on `stream`: reading through a missing group rejects with NOGROUP.
 */
async function hasGroup(redis: FakeStreamRedis, stream: string): Promise<boolean> {
  try {
    await redis.xreadgroup("GROUP", "g", "c1", "COUNT", 1, "STREAMS", stream, "0");
    return true;
  } catch {
    return false;
  }
}

describe("brokerPlugin", () => {
  afterEach(async () => {
    await container.broker?.stop();
    container.broker = undefined as never;
  });

  test("GIVEN the factory THEN the plugin is named", () => {
    expect((brokerPlugin() as { name: string }).name).toBe("@wolfstar/plugin-broker");
  });

  test("GIVEN neither factory nor client options THEN no consumer is created", () => {
    createClient({ ...base, plugins: [brokerPlugin()] });

    expect(container.broker).toBeUndefined();
  });

  test("GIVEN factory options THEN a consumer is created from them", () => {
    createClient({ ...base, plugins: [brokerPlugin(validOptions())] });

    expect(container.broker).toBeInstanceOf(BrokerConsumer);
  });

  test("GIVEN factory options without redis THEN starting the consumer throws a TypeError, as with ./register", async () => {
    const plugin = brokerPlugin({ stream: "s" });
    const client = new Client({ ...base, plugins: [plugin] });

    expect(container.broker).toBeInstanceOf(BrokerConsumer);
    await expect(
      Promise.resolve().then(() => plugin.postListen?.(client, client.options)),
    ).rejects.toThrow(TypeError);
  });

  test("GIVEN ClientOptions.broker without redis THEN starting the consumer throws a TypeError, as with ./register", async () => {
    const plugin = brokerPlugin();
    const client = new Client({ ...base, broker: { stream: "s" } as never, plugins: [plugin] });

    expect(container.broker).toBeInstanceOf(BrokerConsumer);
    await expect(
      Promise.resolve().then(() => plugin.postListen?.(client, client.options)),
    ).rejects.toThrow(TypeError);
  });

  test("GIVEN ClientOptions.broker only THEN it configures the consumer", () => {
    createClient({ ...base, broker: validOptions(), plugins: [brokerPlugin()] });

    expect(container.broker).toBeInstanceOf(BrokerConsumer);
  });

  test("GIVEN ClientOptions.broker THEN it is merged over the factory options", async () => {
    const redis = new FakeStreamRedis();
    createClient({
      ...base,
      broker: { stream: "from-client" } as never,
      plugins: [brokerPlugin(validOptions(redis))],
    });

    await container.broker.start();

    expect(await hasGroup(redis, "from-client")).toBe(true);
    expect(await hasGroup(redis, "events")).toBe(false);
  });

  test("GIVEN a consumer THEN postListen starts it once", async () => {
    const redis = new FakeStreamRedis();
    const plugin = brokerPlugin(validOptions(redis));
    const client = new Client({ ...base, plugins: [plugin] });
    const start = vi.spyOn(container.broker, "start");
    expect(await hasGroup(redis, "events")).toBe(false);

    await plugin.postListen?.(client, {} as ClientOptions);

    expect(start).toHaveBeenCalledOnce();
    expect(await hasGroup(redis, "events")).toBe(true);
  });

  test("GIVEN a consumer from ClientOptions.broker THEN postListen starts it", async () => {
    const redis = new FakeStreamRedis();
    const plugin = brokerPlugin();
    const client = new Client({ ...base, broker: validOptions(redis), plugins: [plugin] });

    await plugin.postListen?.(client, client.options);

    expect(await hasGroup(redis, "events")).toBe(true);
  });

  test("GIVEN no consumer THEN postListen does nothing", () => {
    const plugin = brokerPlugin();
    const client = new Client({ ...base, plugins: [plugin] });

    expect(plugin.postListen?.(client, {} as ClientOptions)).toBeUndefined();
  });
});
