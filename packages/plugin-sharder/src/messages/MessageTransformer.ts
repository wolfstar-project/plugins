import { promisify } from "node:util";
import { brotliCompress, brotliDecompress, gunzip, gzip, type ZlibOptions } from "node:zlib";
import type { ChannelData } from "./MessageHandler.js";

/**
 * The channel a transformer reads or writes on.
 */
export interface TransformerContext {
  /**
   * The ID of the channel: the shard the data comes from or goes to.
   */
  channelId: number;
}

/**
 * Transforms serialized data on its way to the channel, and back: compression, encryption, signing, ...
 *
 * @remarks
 * Transformers compose: they write in the order they are given, and read in the reverse order. `[gzip, aes]` gzips
 * then encrypts when writing, and decrypts then gunzips when reading. A transformer throwing while reading rejects the
 * data, which is reported as an invalid message.
 *
 * Like {@link MessageHandler}s, the manager tells its shards the names of its transformers: custom ones must be
 * registered in the shards too, see {@link registerMessageTransformer}.
 */
export interface MessageTransformer {
  /**
   * The name of the transformer in the registry.
   */
  readonly name: string;
  write(data: ChannelData, context: TransformerContext): ChannelData | Promise<ChannelData>;
  read(data: ChannelData, context: TransformerContext): ChannelData | Promise<ChannelData>;
}

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const brotliCompressAsync = promisify(brotliCompress);
const brotliDecompressAsync = promisify(brotliDecompress);

/**
 * Compresses messages with gzip.
 */
export class GzipTransformer implements MessageTransformer {
  public readonly name = "gzip";
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
  public readonly name = "brotli";

  public write(data: ChannelData): Promise<Uint8Array> {
    return brotliCompressAsync(data);
  }

  public read(data: ChannelData): Promise<Uint8Array> {
    return brotliDecompressAsync(data);
  }
}

const transformers = new Map<string, () => MessageTransformer>([
  ["gzip", () => new GzipTransformer()],
  ["brotli", () => new BrotliTransformer()],
]);

/**
 * Registers a message transformer under its name, so managers and shards can refer to it by name.
 *
 * @param name The name of the transformer, the same as its `name`.
 * @param factory Builds the transformer, e.g. with a key read from the environment.
 */
export function registerMessageTransformer(name: string, factory: () => MessageTransformer): void {
  transformers.set(name, factory);
}

/**
 * Resolves a message transformer, or the name of a registered one.
 *
 * @param transformer The transformer, or its name.
 */
export function resolveMessageTransformer(
  transformer: MessageTransformer | string,
): MessageTransformer {
  if (typeof transformer !== "string") return transformer;

  const factory = transformers.get(transformer);
  if (!factory) throw new RangeError(`There is no message transformer named "${transformer}"`);
  return factory();
}
