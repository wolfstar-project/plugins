import { Listener } from "@wolfstar/http-framework";
import type { ApiRequest } from "../lib/structures/api/ApiRequest";
import type { ApiResponse } from "../lib/structures/api/ApiResponse";
import { HttpCodes } from "../lib/structures/http/HttpCodes";
import { ServerEvent } from "../lib/structures/http/Server";

/**
 * Logs the error and responds with a generic 500 when a middleware throws.
 */
export class PluginServerMiddlewareErrorListener extends Listener {
  public constructor(context: Listener.LoaderContext) {
    super(context, { emitter: "server", event: ServerEvent.MiddlewareError });
  }

  public override run(error: unknown, _request: ApiRequest, response: ApiResponse): void {
    this.container.logger.fatal(error);
    if (response.writableEnded) return;
    if (response.headersSent) response.end();
    else response.error(HttpCodes.InternalServerError);
  }
}
