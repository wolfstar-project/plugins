import { container } from "@wolfstar/http-framework";
import type { ApiRequest } from "../lib/http/ApiRequest";
import type { ApiResponse } from "../lib/http/ApiResponse";
import { Middleware } from "../lib/structures/Middleware";

/**
 * Sets CORS headers on every response and short-circuits `OPTIONS` pre-flight requests.
 * Runs first (position 10); 404/405 handling stays the sole responsibility of the router
 * listeners, so it is not duplicated here.
 */
export class HeadersMiddleware extends Middleware {
  public constructor(context: Middleware.LoaderContext) {
    super(context, { position: 10 });
  }

  public override run(request: ApiRequest, response: ApiResponse): void {
    const origin = container.server.options.origin ?? "*";

    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    response.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS",
    );
    response.setHeader("Date", new Date().toUTCString());

    if (request.method === "OPTIONS") response.noContent();
  }
}
