// Portions of `prepare` and `encodeCookieOctet` are derived from cookie-httponly:
// Copyright (c) 2018 Stanislav Woodger. All rights reserved. MIT license.
// Source: https://github.com/woodger/cookie-httponly
import type { IncomingMessage, ServerResponse } from "node:http";
import { isIP } from "node:net";
import { getDomain } from "tldts";

export interface SecureCookieStoreSetOptions {
  expires?: Date;
  maxAge?: number;
  domain?: string;
  path?: string;
  httpOnly?: boolean;
}

const octetRegExp = /[^\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]/;

function encodeCookieOctet(value: string): string {
  if (octetRegExp.test(value)) throw new TypeError("Invalid character in value");
  return encodeURIComponent(value);
}

function getHostDomain(host: string): string {
  const lower = host.toLowerCase();
  const domain = getDomain(lower);
  return domain === null ? lower : `.${domain}`;
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export class CookieStore extends Map<string, string> {
  readonly #response: ServerResponse;
  readonly #secure: boolean;
  readonly #domain: string;

  public constructor(
    request: IncomingMessage,
    response: ServerResponse,
    secure = false,
    domainOverwrite: string | null = null,
  ) {
    super();
    this.#response = response;
    this.#secure = secure;

    const splitHost = request.headers.host?.split(":")[0] ?? "";
    this.#domain = domainOverwrite ?? getHostDomain(splitHost);

    const header = request.headers.cookie;
    if (typeof header !== "string") return;

    for (const pair of header.split(";")) {
      const index = pair.indexOf("=");
      if (index === -1) continue;

      const key = safeDecode(pair.slice(0, index).trim());
      const value = safeDecode(pair.slice(index + 1).trim());
      if (key === null || value === null) continue;

      this.set(key, value);
    }
  }

  /**
   * Adds a cookie and queues the matching `Set-Cookie` header. Nothing is stored if the cookie is invalid.
   */
  public add(name: string, value: string, options: SecureCookieStoreSetOptions = {}): this {
    const cookie = this.prepare(name, value, options);
    this.set(name, value);
    this.insert(name, cookie);
    return this;
  }

  /**
   * Removes a cookie and queues an already-expired `Set-Cookie` header for it.
   */
  public remove(name: string): this {
    this.delete(name);
    this.insert(name, this.prepare(name, "", { expires: new Date(0) }));
    return this;
  }

  private insert(name: string, cookie: string): void {
    const existing = this.#response.getHeader("Set-Cookie");
    const list =
      existing === undefined ? [] : Array.isArray(existing) ? existing : [String(existing)];
    const prefix = `${encodeURIComponent(name)}=`;
    this.#response.setHeader("Set-Cookie", [
      ...list.filter((entry) => !entry.startsWith(prefix)),
      cookie,
    ]);
  }

  private prepare(
    name: string,
    value: string,
    { expires, maxAge, domain, path, httpOnly }: SecureCookieStoreSetOptions,
  ): string {
    const effectiveDomain = (domain ?? this.#domain).toLowerCase();
    if (isIP(effectiveDomain) !== 0) {
      throw new Error(
        "The connection must be established from the domain name (i.e., not an IP address)",
      );
    }

    let cookie = `${encodeCookieOctet(name)}=${encodeCookieOctet(value)}`;
    if (expires !== undefined) cookie += `; Expires=${expires.toUTCString()}`;
    else if (maxAge !== undefined) cookie += `; Max-Age=${maxAge}`;

    if (effectiveDomain !== "") cookie += `; Domain=${effectiveDomain}`;
    cookie += `; Path=${path ?? "/"}`;
    if (this.#secure) cookie += "; Secure";
    if (httpOnly ?? true) cookie += "; HttpOnly";

    return cookie;
  }
}
