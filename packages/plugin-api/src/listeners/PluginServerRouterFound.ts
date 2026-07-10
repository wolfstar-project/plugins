import { container, Listener } from "@wolfstar/http-framework";
import type { ApiRequest } from "../lib/http/ApiRequest";
import type { ApiResponse } from "../lib/http/ApiResponse";
import { ApiServerEvent } from "../lib/http/ApiServer";

/**
 * Invokes the matched route's `run` method, emitting `routeError` if it throws.
 */
export class PluginServerRouterFoundListener extends Listener {
  public constructor(context: Listener.LoaderContext) {
    super(context, { emitter: "server", event: ApiServerEvent.RouterFound });
  }

  public override async run(request: ApiRequest, response: ApiResponse): Promise<void> {
    try {
      await request.route!.run(request, response);
    } catch (error) {
      container.server.emit(ApiServerEvent.RouteError, error, request, response);
    }
  }
}
