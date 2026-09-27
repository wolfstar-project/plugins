import { pack, unpack } from "msgpackr";
import type { CacheCodec } from "./lib/codec.js";

/**
 * A {@link CacheCodec} backed by [`msgpackr`](https://github.com/kriszyp/msgpackr): a denser, lossless alternative
 * to JSON that natively supports `bigint` and binary values.
 *
 * @remarks
 * Imported from the `@wolfstar/plugin-cache/msgpack` subpath rather than the package root, so importing the package
 * never resolves the optional `msgpackr` peer dependency unless this codec is actually used.
 */
export function msgpackCodec(): CacheCodec {
  return {
    name: "msgpack",
    encode(value) {
      return pack(value);
    },
    decode(data) {
      return unpack(typeof data === "string" ? Buffer.from(data, "utf8") : data);
    },
  };
}
