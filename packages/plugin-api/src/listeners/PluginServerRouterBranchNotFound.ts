import { Listener } from "@wolfstar/http-framework";
import type { ApiRequest } from "../lib/structures/api/ApiRequest";
import type { ApiResponse } from "../lib/structures/api/ApiResponse";
import { ServerEvent } from "../lib/structures/http/Server";

/**
 * Responds with a 404 when no route matched the path and no middleware ended the response.
 */
export class PluginServerRouterBranchNotFoundListener extends Listener {
  public constructor(context: Listener.LoaderContext) {
    super(context, { emitter: "server", event: ServerEvent.RouterBranchNotFound });
  }

  public override run(_request: ApiRequest, response: ApiResponse): void {
    if (response.writableEnded) return;
    if (response.headersSent) response.end();
    else response.notFound();
  }
}
