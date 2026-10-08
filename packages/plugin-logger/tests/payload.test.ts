import { LogLevel } from "@wolfstar/http-framework";
import { describe, expect, test } from "vitest";
import { Logger } from "../src/lib/Logger";
import { createLogPayload } from "../src/lib/payload";
import type { LogPayload } from "../src/lib/types";

function payloadOf(...values: unknown[]) {
  return createLogPayload(LogLevel.Info, values);
}

describe("createLogPayload", () => {
  test("GIVEN plain strings THEN they are joined into the message", () => {
    const payload = payloadOf("a", "b");

    expect(payload.message).toBe("a b");
    expect(payload.error).toBeUndefined();
    expect(payload.context).toBeUndefined();
  });

  test("GIVEN a message and an Error THEN the message is kept next to the error", () => {
    const error = new Error("payment declined");
    const payload = payloadOf("Failed to handle command", error);

    expect(payload.message).toBe("Failed to handle command");
    expect(payload.error).toBe(error);
  });

  test("GIVEN only an Error THEN the message falls back to the error's own", () => {
    const payload = payloadOf(new Error("payment declined"));

    expect(payload.message).toBe("payment declined");
  });

  test("GIVEN several Errors THEN the first is the error", () => {
    const first = new Error("first");
    const payload = payloadOf(first, new Error("second"));

    expect(payload.error).toBe(first);
  });

  test("GIVEN plain objects THEN they are merged into the context, the last one winning", () => {
    const payload = payloadOf("joined", { guildId: "1", shard: 0 }, { guildId: "2" });

    expect(payload.message).toBe("joined");
    expect(payload.context).toEqual({ guildId: "2", shard: 0 });
  });

  test("GIVEN non-plain objects THEN they are stringified into the message", () => {
    const payload = payloadOf("ids", [1, 2], new Map());

    expect(payload.message).toBe("ids [1,2] {}");
    expect(payload.context).toBeUndefined();
  });

  test("GIVEN primitives THEN they are stringified into the message", () => {
    expect(payloadOf("n", 1, null, undefined, true).message).toBe("n 1 null undefined true");
  });

  test("GIVEN an unserialisable value THEN it falls back to String()", () => {
    const circular: unknown[] = [];
    circular.push(circular);

    expect(payloadOf(circular).message).toBe("");
  });

  test("GIVEN the raw values THEN they are forwarded untouched", () => {
    const values = ["a", { b: 1 }];

    expect(createLogPayload(LogLevel.Warn, values).values).toBe(values);
  });

  test("GIVEN a payload THEN the derived fields are computed once", () => {
    const payload = payloadOf("a", { b: 1 });

    expect(payload.context).toBe(payload.context);
  });
});

describe("Logger payloads", () => {
  test("GIVEN a logged entry THEN transports receive the derived fields", () => {
    const received: LogPayload[] = [];
    const logger = new Logger({
      transports: [{ log: (payload) => void received.push(payload) }],
    });
    const error = new Error("boom");

    logger.error("Failed", { id: 1 }, error);

    expect(received[0].message).toBe("Failed");
    expect(received[0].context).toEqual({ id: 1 });
    expect(received[0].error).toBe(error);
  });
});
