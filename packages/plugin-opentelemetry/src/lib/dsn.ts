/**
 * The parts of a Sentry DSN the tracing needs.
 */
export interface SentryDsn {
  /**
   * The public key, the user of the DSN.
   */
  publicKey: string;

  /**
   * The scheme and host (with its port) of the Sentry the DSN points at.
   */
  origin: string;

  /**
   * What a Sentry hosted under a path keeps in front of `/api/<project>`, empty otherwise.
   */
  prefix: string;

  /**
   * The project, the last segment of the path of the DSN.
   */
  project: string;

  /**
   * The host name, without a port.
   */
  hostname: string;
}

/**
 * Reads a Sentry DSN (`<scheme>://<key>@<host>[/<path>]/<project>`).
 *
 * @param dsn The DSN.
 * @returns The parts of the DSN, `undefined` when it cannot be read or has no project.
 */
export function parseSentryDsn(dsn: string | undefined): SentryDsn | undefined {
  if (!dsn) return undefined;

  let url: URL;
  try {
    url = new URL(dsn);
  } catch {
    return undefined;
  }

  // The project is the last segment of the path, and a Sentry hosted under a path keeps the rest in front of it.
  const segments = url.pathname.split("/").filter(Boolean);
  const project = segments.pop();
  if (!project) return undefined;

  return {
    publicKey: decodeURIComponent(url.username),
    origin: `${url.protocol}//${url.host}`,
    prefix: segments.length > 0 ? `/${segments.join("/")}` : "",
    project,
    hostname: url.hostname,
  };
}

/**
 * The OTLP traces endpoint of the Sentry project of a DSN, and the header that authenticates an export to it.
 *
 * @param dsn The DSN of the Sentry project.
 * @returns The endpoint, `undefined` when the DSN cannot be read or holds no public key.
 */
export function getSentryOtlpEndpoint(
  dsn: string | undefined,
): { url: string; headers: Record<string, string> } | undefined {
  const parsed = parseSentryDsn(dsn);
  if (!parsed?.publicKey) return undefined;

  return {
    url: `${parsed.origin}${parsed.prefix}/api/${parsed.project}/integration/otlp/v1/traces/`,
    headers: { "x-sentry-auth": `sentry sentry_key=${parsed.publicKey}` },
  };
}
