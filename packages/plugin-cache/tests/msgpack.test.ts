import { describe, expect, test } from "vitest";
import { msgpackCodec } from "../src/msgpack.js";

describe("msgpackCodec", () => {
  test("GIVEN a value THEN it round-trips through msgpack as a Buffer", () => {
    const codec = msgpackCodec();
    const value = { id: "1", nested: { list: [1, 2, 3] } };

    const encoded = codec.encode(value);
    expect(Buffer.isBuffer(encoded)).toBe(true);
    expect(codec.decode(encoded)).toEqual(value);
  });

  test("GIVEN a bigint field THEN it round-trips losslessly", () => {
    const codec = msgpackCodec();
    const value = { count: 9_007_199_254_740_993n };

    expect(codec.decode(codec.encode(value))).toEqual(value);
  });

  test("GIVEN the codec THEN its name is msgpack", () => {
    expect(msgpackCodec().name).toBe("msgpack");
  });
});
