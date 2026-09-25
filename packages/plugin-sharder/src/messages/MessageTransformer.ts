import { promisify } from "node:util";
import { brotliCompress, brotliDecompress, gunzip, gzip, type ZlibOptions } from "node:zlib";
import type { ChannelData } from "./MessageHandler.js";

/**
 * Transforms serialized data on its way to the channel, and back: compression, encryption, signing, ...
 *
 * @remarks
 * Transformers compose: they write in the order they are given, and read in the reverse order. `[gzip, aes]` gzips
 * then encrypts when writing, and decrypts then gunzips when reading. A transformer rejecting while reading drops the
 * message, reported as an invalid message.
 */
export interface MessageTransformer {
  write(data: ChannelData): ChannelData | Promise<ChannelData>;
  read(data: ChannelData): ChannelData | Promise<ChannelData>;
}

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const brotliCompressAsync = promisify(brotliCompress);
const brotliDecompressAsync = promisify(brotliDecompress);

/**
 * Compresses messages with gzip.
 */
export class GzipTransformer implements MessageTransformer {
  private readonly options: ZlibOptions;

  /**
   * @param options The compression options, e.g. its `level`.
   */
  public constructor(options: ZlibOptions = {}) {
    this.options = options;
  }

  public write(data: ChannelData): Promise<Uint8Array> {
    return gzipAsync(data, this.options);
  }

  public read(data: ChannelData): Promise<Uint8Array> {
    return gunzipAsync(data);
  }
}

/**
 * Compresses messages with Brotli, smaller than gzip at a higher CPU cost.
 */
export class BrotliTransformer implements MessageTransformer {
  public write(data: ChannelData): Promise<Uint8Array> {
    return brotliCompressAsync(data);
  }

  public read(data: ChannelData): Promise<Uint8Array> {
    return brotliDecompressAsync(data);
  }
}
