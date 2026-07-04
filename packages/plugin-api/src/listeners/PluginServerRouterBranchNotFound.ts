import { Listener } from "@wolfstar/http-framework";
import type { ApiRequest } from "../lib/http/ApiRequest";
import type { ApiResponse } from "../lib/http/ApiResponse";
import { ApiServerEvent } from "../lib/http/ApiServer";

/**
 * Responds with a 404 when no route matched the request's pathname.
 */
export class PluginServerRouterBranchNotFoundListener extends Listener {
  public constructor(context: Listener.LoaderContext) {
    super(context, { emitter: "server", event: ApiServerEvent.RouterBranchNotFound });
  }

  public override run(_request: ApiRequest, response: ApiResponse): void {
    if (!response.writableEnded) response.notFound();
  }
}
