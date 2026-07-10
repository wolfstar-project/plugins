import { Listener } from "@wolfstar/http-framework";
import type { ApiRequest } from "../lib/http/ApiRequest";
import type { ApiResponse } from "../lib/http/ApiResponse";
import { ApiServerEvent } from "../lib/http/ApiServer";

/**
 * Responds with a 405 when the pathname matched but no route handles this HTTP method.
 */
export class PluginServerRouterBranchMethodNotAllowedListener extends Listener {
  public constructor(context: Listener.LoaderContext) {
    super(context, { emitter: "server", event: ApiServerEvent.RouterBranchMethodNotAllowed });
  }

  public override run(_request: ApiRequest, response: ApiResponse): void {
    if (!response.writableEnded) response.methodNotAllowed();
  }
}
