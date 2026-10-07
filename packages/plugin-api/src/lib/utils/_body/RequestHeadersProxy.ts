import type { IncomingMessage } from "node:http";
import { splitSetCookieString } from "cookie-es";
import { isNullishOrEmpty } from "../common";
import { NodeUtilInspectSymbol } from "../constants";

function normalizeValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value.join(", ") : String(value ?? "");
}

/**
 * A `Headers` view over the headers of a Node.js `IncomingMessage`. Reads and writes go straight to the request.
 */
export class RequestHeadersProxy implements Headers {
  readonly #request: IncomingMessage;

  public constructor(request: IncomingMessage) {
    this.#request = request;
  }

  public append(name: string, value: string): void {
    const key = name.toLowerCase();
    const existing = this.#request.headers[key];
    if (isNullishOrEmpty(existing)) {
      this.#request.headers[key] = value;
    } else {
      this.#request.headers[key] = Array.isArray(existing)
        ? [...existing, value]
        : [existing, value];
    }
  }

  public delete(name: string): void {
    this.#request.headers[name.toLowerCase()] = undefined;
  }

  public get(name: string): string | null {
    const value = this.#request.headers[name.toLowerCase()];
    return isNullishOrEmpty(value) ? null : normalizeValue(value);
  }

  public getSetCookie(): string[] {
    const value = this.get("set-cookie");
    return value === null ? [] : splitSetCookieString(value);
  }

  public has(name: string): boolean {
    return !isNullishOrEmpty(this.#request.headers[name.toLowerCase()]);
  }

  public set(name: string, value: string): void {
    this.#request.headers[name.toLowerCase()] = value;
  }

  public forEach(
    callback: (value: string, key: string, parent: Headers) => void,
    thisArg?: unknown,
  ): void {
    for (const [key, value] of this.entries()) {
      callback.call(thisArg, value, key, this);
    }
  }

  public *keys(): Generator<string, undefined, undefined> {
    for (const [key] of this.entries()) yield key;
    return undefined;
  }

  public *values(): Generator<string, undefined, undefined> {
    for (const [, value] of this.entries()) yield value;
    return undefined;
  }

  public *entries(): Generator<[string, string], undefined, undefined> {
    for (const [key, value] of Object.entries(this.#request.headers)) {
      if (isNullishOrEmpty(value)) continue;
      yield [key, normalizeValue(value)];
    }

    return undefined;
  }

  public [Symbol.iterator](): Generator<[string, string], undefined, undefined> {
    return this.entries();
  }

  public get [Symbol.toStringTag](): string {
    return "Headers";
  }

  public [NodeUtilInspectSymbol](): Record<string, string> {
    return Object.fromEntries(this.entries());
  }
}
