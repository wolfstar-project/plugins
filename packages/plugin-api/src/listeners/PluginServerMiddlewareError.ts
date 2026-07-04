import { Listener } from "@wolfstar/http-framework";
import type { ApiRequest } from "../lib/http/ApiRequest";
import type { ApiResponse } from "../lib/http/ApiResponse";
import { ApiServerEvent } from "../lib/http/ApiServer";

/**
 * Logs and responds with a 500 when a middleware throws.
 */
export class PluginServerMiddlewareErrorListener extends Listener {
  public constructor(context: Listener.LoaderContext) {
    super(context, { emitter: "server", event: ApiServerEvent.MiddlewareError });
  }

  public override run(error: unknown, _request: ApiRequest, response: ApiResponse): void {
    console.error("[plugin-api] Middleware error:", error);
    if (!response.writableEnded) response.error();
  }
}
