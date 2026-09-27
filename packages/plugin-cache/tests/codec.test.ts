import { describe, expect, test } from "vitest";
import { jsonCodec } from "../src/index.js";

describe("jsonCodec", () => {
  test("GIVEN a value THEN it round-trips through JSON", () => {
    const codec = jsonCodec();
    const value = { id: "1", nested: { list: [1, 2, 3] } };

    const encoded = codec.encode(value);
    expect(typeof encoded).toBe("string");
    expect(encoded).toBe(JSON.stringify(value));
    expect(codec.decode(encoded)).toEqual(value);
  });

  test("GIVEN a Buffer THEN decode still parses it as JSON text", () => {
    const codec = jsonCodec();
    const value = { id: "1" };

    expect(codec.decode(Buffer.from(JSON.stringify(value), "utf8"))).toEqual(value);
  });

  test("GIVEN the codec THEN its name is json", () => {
    expect(jsonCodec().name).toBe("json");
  });
});
