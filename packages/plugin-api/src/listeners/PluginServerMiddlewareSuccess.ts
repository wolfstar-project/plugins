import { container, Listener } from "@wolfstar/http-framework";
import type { ApiRequest } from "../lib/structures/api/ApiRequest";
import type { ApiResponse } from "../lib/structures/api/ApiResponse";
import { ServerEvent } from "../lib/structures/http/Server";

/**
 * Runs the matched route once every middleware passed; a throw is reported as `RouteError`.
 */
export class PluginServerMiddlewareSuccessListener extends Listener {
  public constructor(context: Listener.LoaderContext) {
    super(context, { emitter: "server", event: ServerEvent.MiddlewareSuccess });
  }

  public override async run(request: ApiRequest, response: ApiResponse): Promise<void> {
    try {
      await request.route!.run(request, response);
    } catch (error) {
      container.server.emit(ServerEvent.RouteError, error, request, response);
    }
  }
}
