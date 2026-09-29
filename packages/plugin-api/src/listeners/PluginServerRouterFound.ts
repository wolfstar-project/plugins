import { container, Listener } from "@wolfstar/http-framework";
import type { ApiRequest } from "../lib/structures/api/ApiRequest";
import type { ApiResponse } from "../lib/structures/api/ApiResponse";
import { ServerEvent } from "../lib/structures/http/Server";

/**
 * Reports whether the middlewares let the request through (`MiddlewareSuccess`) or already ended
 * the response (`MiddlewareFailure`).
 */
export class PluginServerRouterFoundListener extends Listener {
  public constructor(context: Listener.LoaderContext) {
    super(context, { emitter: "server", event: ServerEvent.RouterFound });
  }

  public override run(request: ApiRequest, response: ApiResponse): void {
    if (response.writableEnded) {
      container.server.emit(ServerEvent.MiddlewareFailure, request, response);
    } else {
      container.server.emit(ServerEvent.MiddlewareSuccess, request, response);
    }
  }
}
