import { Listener } from "@wolfstar/http-framework";
import type { ApiRequest } from "../lib/structures/api/ApiRequest";
import type { ApiResponse } from "../lib/structures/api/ApiResponse";
import { ServerEvent } from "../lib/structures/http/Server";
import type { RouterBranch } from "../lib/structures/router/RouterBranch";

/**
 * Responds with a 405 when the path matched but the method did not, and no middleware ended the response.
 */
export class PluginServerRouterBranchMethodNotAllowedListener extends Listener {
  public constructor(context: Listener.LoaderContext) {
    super(context, { emitter: "server", event: ServerEvent.RouterBranchMethodNotAllowed });
  }

  public override run(_request: ApiRequest, response: ApiResponse, _branch: RouterBranch): void {
    if (response.writableEnded) return;
    if (response.headersSent) response.end();
    else response.methodNotAllowed();
  }
}
