import type { OutgoingHttpHeaders } from "node:http";
import { parseSentryDsn } from "./dsn.js";

/**
 * The slice of the options of an outgoing `http` request the instrumentation hooks read, as `http.request` is given
 * them.
 */
export interface OutgoingRequestOptions {
  headers?: OutgoingHttpHeaders | readonly string[];
  host?: string | null;
  hostname?: string | null;
  path?: string | null;
}

/**
 * The slice of a request of `undici` the instrumentation hook reads.
 */
export interface UndiciRequestLike {
  origin?: string | URL;
  path: string;
}

/**
 * The configuration of the automatic instrumentations that differs from their defaults.
 *
 * @remarks
 * The URL of a request to a webhook of Discord holds its token, and so does the answer to an interaction: the logs
 * sent through the webhook of their channel, and the follow-ups of a command, would put a token that lets anybody
 * post there in every span of `undici`, which go to every destination of the traces. The token is replaced before the
 * span starts.
 *
 * The transport of Sentry sends each event with `https.request` and the key of the DSN in the query, so its requests
 * are not traced at all ({@link isSentryEnvelopeRequest}): their spans would hold the key and add a span to every
 * error.
 *
 * Nor is the handshake of a WebSocket ({@link isWebSocketHandshake}): the gateway of Discord opens its connection with
 * one, and the connection lasts for hours. What the bot does with the dispatches it receives runs in the context of
 * that request, so every span of the gateway would end up in one trace that never closes.
 *
 * @param dsn The DSN of Sentry, `SENTRY_DSN`.
 */
export function getInstrumentationConfig(dsn?: string) {
  return {
    "@opentelemetry/instrumentation-http": {
      ignoreOutgoingRequestHook: (request: OutgoingRequestOptions) =>
        isWebSocketHandshake(request) || isSentryEnvelopeRequest(request, dsn),
    },
    "@opentelemetry/instrumentation-undici": {
      startSpanHook: (request: UndiciRequestLike) => {
        const url = new URL(request.path, request.origin);
        url.pathname = redactDiscordTokens(url.pathname);
        return { "url.full": url.toString(), "url.path": url.pathname };
      },
    },
  };
}

/**
 * Whether a request of `http` or `https` opens a WebSocket: its `Upgrade` header asks for one, whatever its case.
 *
 * @param request The options of the request, as `http.request` is given them.
 */
export function isWebSocketHandshake(request: Pick<OutgoingRequestOptions, "headers">): boolean {
  const { headers } = request;
  if (!headers) return false;

  // `http.request` takes the headers as an object, or as a flat list of names and values.
  const entries: [name: string, value: unknown][] = Array.isArray(headers)
    ? Array.from({ length: Math.floor(headers.length / 2) }, (_, index) => [
        headers[index * 2],
        headers[index * 2 + 1],
      ])
    : Object.entries(headers);

  return entries.some(
    ([name, value]) =>
      name.toLowerCase() === "upgrade" && String(value).toLowerCase() === "websocket",
  );
}

/**
 * Whether a request of `http` or `https` is one the transport of Sentry sends an event with: to the host of the DSN,
 * on the path of an envelope of its project (`[/<path>]/api/<project>/envelope/`, the path of a Sentry hosted under
 * one).
 *
 * @param request The options of the request, as `http.request` is given them.
 * @param dsn The DSN of Sentry.
 */
export function isSentryEnvelopeRequest(
  request: Pick<OutgoingRequestOptions, "host" | "hostname" | "path">,
  dsn: string | undefined,
): boolean {
  const parsed = parseSentryDsn(dsn);
  if (!parsed) return false;

  const host = request.hostname ?? request.host?.replace(/:\d+$/, "");
  return (
    host === parsed.hostname &&
    (request.path ?? "").startsWith(`${parsed.prefix}/api/${parsed.project}/envelope/`)
  );
}

/**
 * Replaces the token in the path of a request to a webhook or an interaction of Discord (`/webhooks/<id>/<token>`,
 * `/interactions/<id>/<token>`) with `REDACTED`.
 *
 * @param path The path of the request.
 */
export function redactDiscordTokens(path: string): string {
  return path.replace(/\/(webhooks|interactions)\/(\d+)\/[^/?#]+/g, "/$1/$2/REDACTED");
}
