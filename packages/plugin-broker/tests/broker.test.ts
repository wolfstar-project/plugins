import { jsonCodec } from "@wolfstar/plugin-cache";
import { describe, expect, test } from "vitest";
import { createBroker, fieldsToRecord } from "../src/index.js";
import { FakeStreamRedis } from "./fixtures/FakeStreamRedis.js";

describe("createBroker", () => {
  test("GIVEN a payload THEN publish XADDs an entry readable by a consumer group", async () => {
    const redis = new FakeStreamRedis();
    const broker = createBroker({ redis, stream: "events" });

    await redis.xgroup("CREATE", "events", "g", "$", "MKSTREAM");
    const id = await broker.publish("messageCreate", { id: "1" });

    expect(typeof id).toBe("string");
    const [[, entries]] = (await redis.xreadgroup(
      "GROUP",
      "g",
      "c",
      "COUNT",
      10,
      "STREAMS",
      "events",
      ">",
    ))!;
    expect(entries).toHaveLength(1);
    const [[entryId, fields]] = entries;
    expect(entryId).toBe(id);
    expect(fields).toContain("event");
    expect(fields).toContain("messageCreate");
  });

  test("GIVEN a codec THEN the payload field decodes back to the original value", async () => {
    const redis = new FakeStreamRedis();
    const codec = jsonCodec();
    const broker = createBroker({ redis, stream: "events", codec });
    await redis.xgroup("CREATE", "events", "g", "$", "MKSTREAM");

    await broker.publish("messageCreate", { id: "42", content: "hi" });

    const [[, entries]] = (await redis.xreadgroup(
      "GROUP",
      "g",
      "c",
      "COUNT",
      10,
      "STREAMS",
      "events",
      ">",
    ))!;
    const [[, fields]] = entries;
    const payloadIndex = fields.indexOf("payload") + 1;
    const decoded = codec.decode(Buffer.from(fields[payloadIndex]!, "base64"));

    expect(decoded).toEqual({ id: "42", content: "hi" });
  });

  test("GIVEN publish options THEN the entry carries an encoded state and the shard", async () => {
    const redis = new FakeStreamRedis();
    const codec = jsonCodec();
    const broker = createBroker({ redis, stream: "events", codec });

    await broker.publish("messageUpdate", { id: "1" }, { state: { content: "old" }, shard: 2 });

    const [{ fields }] = redis.entriesOf("events");
    const record = fieldsToRecord(fields);
    expect(codec.decode(Buffer.from(record.state!, "base64"))).toEqual({ content: "old" });
    expect(record.shard).toBe("2");
  });

  test("GIVEN no publish options THEN the entry holds only the event and payload", async () => {
    const redis = new FakeStreamRedis();
    const broker = createBroker({ redis, stream: "events" });

    await broker.publish("messageCreate", { id: "1" });

    const [{ fields }] = redis.entriesOf("events");
    expect(Object.keys(fieldsToRecord(fields))).toEqual(["event", "payload"]);
  });

  test("GIVEN maxLength THEN old entries are trimmed", async () => {
    const redis = new FakeStreamRedis();
    const broker = createBroker({ redis, stream: "events", maxLength: 2 });
    await redis.xgroup("CREATE", "events", "g", "$", "MKSTREAM");

    await broker.publish("a", 1);
    await broker.publish("b", 2);
    await broker.publish("c", 3);

    const [[, entries]] = (await redis.xreadgroup(
      "GROUP",
      "g",
      "c",
      "COUNT",
      10,
      "STREAMS",
      "events",
      ">",
    ))!;
    expect(entries).toHaveLength(2);
  });
});
