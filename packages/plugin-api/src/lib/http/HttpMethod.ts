/**
 * The HTTP methods that a {@link Route} can be registered for.
 */
export const HttpMethods = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"] as const;

export type HttpMethod = (typeof HttpMethods)[number];
