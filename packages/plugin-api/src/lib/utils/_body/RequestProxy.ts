import { Blob } from "node:buffer";
import type { IncomingMessage } from "node:http";
import { arrayBuffer } from "node:stream/consumers";
import { ReadableStream } from "node:stream/web";
import { Response, type FormData } from "undici";
import { RequestHeadersProxy } from "./RequestHeadersProxy";
import { RequestURLProxy } from "./RequestURLProxy";

/**
 * A WHATWG `Request` view over an `IncomingMessage`. The body stream is created lazily and wired to
 * the underlying Node stream, so readers settle when the client finishes or disconnects.
 */
export class RequestProxy implements Request {
  public readonly cache = "default" as const;
  public readonly credentials = "same-origin" as const;
  public readonly destination = "" as const;
  public readonly integrity = "";
  public readonly keepalive = false;
  public readonly mode = "cors" as const;
  public readonly redirect = "follow" as const;
  public readonly referrer = "about:client";
  public readonly referrerPolicy = "" as const;
  public readonly duplex = "half" as const;

  public readonly headers: RequestHeadersProxy;
  public readonly method: string;
  public readonly signal: AbortSignal;

  readonly #request: IncomingMessage;
  readonly #url: RequestURLProxy;
  readonly #abortController = new AbortController();
  #body: ReadableStream<Uint8Array> | null = null;
  #bodyUsed = false;

  public constructor(request: IncomingMessage) {
    this.#request = request;
    this.headers = new RequestHeadersProxy(request);
    this.#url = new RequestURLProxy(request);
    this.method = (request.method ?? "GET").toUpperCase();
    this.signal = this.#abortController.signal;
  }

  public get url(): string {
    return this.#url.href;
  }

  public get bodyUsed(): boolean {
    return this.#bodyUsed;
  }

  public get body(): ReadableStream<Uint8Array> | null {
    if (!this.#hasBody) return null;

    this.#body ??= new ReadableStream<Uint8Array>({
      start: (controller) => {
        const request = this.#request;
        if (request.destroyed && !request.complete) {
          const error = new Error("Request closed before the body was fully received");
          controller.error(error);
          this.#abortController.abort(error);
          return;
        }

        if (request.readableEnded) {
          controller.close();
          return;
        }

        request.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
        request.on("end", () => controller.close());
        request.on("error", (error) => {
          controller.error(error);
          this.#abortController.abort(error);
        });
        request.on("close", () => {
          if (request.complete) return;

          const error = new Error("Request closed before the body was fully received");
          controller.error(error);
          this.#abortController.abort(error);
        });
      },
    });

    return this.#body;
  }

  public async arrayBuffer(): Promise<ArrayBuffer> {
    const body = this.body;
    if (body === null) return new ArrayBuffer(0);

    this.#bodyUsed = true;
    return arrayBuffer(body);
  }

  public async bytes(): Promise<Uint8Array<ArrayBuffer>> {
    return new Uint8Array(await this.arrayBuffer());
  }

  public async blob(): Promise<Blob> {
    return new Blob([await this.arrayBuffer()], { type: this.headers.get("content-type") ?? "" });
  }

  public async formData(): Promise<FormData> {
    if (this.body !== null) this.#bodyUsed = true;
    return new Response(this.body as never, {
      headers: { "content-type": this.headers.get("content-type") ?? "" },
    }).formData();
  }

  public async json(): Promise<unknown> {
    return JSON.parse(await this.text());
  }

  public async text(): Promise<string> {
    return new TextDecoder().decode(await this.arrayBuffer());
  }

  public clone(): RequestProxy {
    return new RequestProxy(this.#request);
  }

  get #hasBody(): boolean {
    const length = Number(this.#request.headers["content-length"]);
    if (Number.isSafeInteger(length) && length > 0) return true;

    return String(this.#request.headers["transfer-encoding"] ?? "")
      .toLowerCase()
      .includes("chunked");
  }
}
