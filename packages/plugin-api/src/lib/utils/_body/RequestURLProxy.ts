import type { IncomingMessage } from "node:http";
import { NodeUtilInspectSymbol } from "../constants";

/**
 * Splits a `host` header into its hostname and port. The port is `-1` when absent or not a number.
 */
export function parseHost(host: string | undefined): [hostname: string, port: number] {
  if (!host) return ["localhost", -1];

  const index = host.indexOf(":");
  if (index === -1) return [host, -1];

  const port = Number.parseInt(host.slice(index + 1), 10);
  return [host.slice(0, index), Number.isNaN(port) ? -1 : port];
}

function parsePath(input: string | undefined): [pathname: string, search: string] {
  const path = (input ?? "/").replaceAll("\\", "/");
  const index = path.indexOf("?");
  if (index === -1) return [path, ""];

  const search = path.slice(index);
  return [path.slice(0, index), search === "?" ? "" : search];
}

/**
 * A `URL` view over an `IncomingMessage`; `pathname`, `search` and `host` write back to the request.
 */
export class RequestURLProxy implements URL {
  public hash = "";
  public password = "";
  public username = "";

  #protocol: string | null = null;
  #pathname: string;
  #search: string;
  #searchParams: URLSearchParams | null = null;
  readonly #request: IncomingMessage;

  public constructor(request: IncomingMessage) {
    this.#request = request;
    [this.#pathname, this.#search] = parsePath(request.url);
  }

  public get host(): string {
    return this.#request.headers.host ?? "";
  }

  public set host(value: string) {
    this.#request.headers.host = value;
  }

  public get hostname(): string {
    return parseHost(this.#request.headers.host)[0];
  }

  public set hostname(value: string) {
    const [, port] = parseHost(this.#request.headers.host);
    this.host = port === -1 ? value : `${value}:${port}`;
  }

  public get port(): string {
    const [, port] = parseHost(this.#request.headers.host);
    return port === -1 ? String(this.#request.socket.localPort ?? "") : String(port);
  }

  public set port(value: string) {
    const [hostname] = parseHost(this.#request.headers.host);
    this.host = value === "" ? hostname : `${hostname}:${value}`;
  }

  public get protocol(): string {
    if (this.#protocol !== null) return this.#protocol;

    const encrypted = (this.#request.socket as unknown as { encrypted?: boolean }).encrypted;
    return encrypted || this.#request.headers["x-forwarded-proto"] === "https" ? "https:" : "http:";
  }

  public set protocol(value: string) {
    this.#protocol = value.endsWith(":") ? value : `${value}:`;
  }

  public get origin(): string {
    return `${this.protocol}//${this.host}`;
  }

  public get pathname(): string {
    return this.#pathname;
  }

  public set pathname(value: string) {
    this.#pathname = value;
    this.#request.url = this.#pathname + this.#search;
  }

  public get search(): string {
    return this.#search;
  }

  public set search(value: string) {
    this.#search = value === "" || value === "?" ? "" : value.startsWith("?") ? value : `?${value}`;
    this.#searchParams = null;
    this.#request.url = this.#pathname + this.#search;
  }

  public get searchParams(): URLSearchParams {
    this.#searchParams ??= new URLSearchParams(this.#search);
    return this.#searchParams;
  }

  public set searchParams(value: URLSearchParams) {
    this.#searchParams = value;
  }

  public get href(): string {
    return this.origin + this.pathname + this.search;
  }

  public set href(value: string) {
    const url = new URL(value);
    this.protocol = url.protocol;
    this.host = url.host;
    this.pathname = url.pathname;
    this.search = url.search;
    this.hash = url.hash;
  }

  public toString(): string {
    return this.href;
  }

  public toJSON(): string {
    return this.href;
  }

  public get [Symbol.toStringTag](): string {
    return "URL";
  }

  public [NodeUtilInspectSymbol](): string {
    return this.href;
  }
}
