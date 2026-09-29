import { container, Listener } from "@wolfstar/http-framework";
import type { ApiRequest } from "../lib/structures/api/ApiRequest";
import type { ApiResponse } from "../lib/structures/api/ApiResponse";
import type { MethodName } from "../lib/structures/http/HttpMethods";
import { ServerEvent } from "../lib/structures/http/Server";
import { RouterRoot } from "../lib/structures/router/RouterRoot";

function splitUrl(url = "/"): [pathname: string, querystring: string] {
  const index = url.indexOf("?");
  return index === -1 ? [url, ""] : [url.slice(0, index), url.slice(index + 1)];
}

/**
 * Resolves the route for a request, runs the middlewares, then dispatches the router event.
 */
export class PluginServerRequestListener extends Listener {
  public constructor(context: Listener.LoaderContext) {
    super(context, { emitter: "server", event: ServerEvent.Request });
  }

  public override async run(request: ApiRequest, response: ApiResponse): Promise<void> {
    const [pathname, querystring] = splitUrl(request.url);
    request.query = Object.fromEntries(new URLSearchParams(querystring).entries());

    const parts = RouterRoot.normalize(pathname);
    const branch = container.server.routes.router.find(parts);
    const node = branch?.node ?? null;
    const route = node?.get((request.method ?? "GET") as MethodName) ?? null;

    if (node) request.params = node.extractParameters(parts);
    request.routerNode = node;
    request.route = route;

    try {
      await container.server.middlewares.run(request, response);
    } catch (error) {
      container.server.emit(ServerEvent.MiddlewareError, error, request, response);
      return;
    }

    if (branch === null) {
      container.server.emit(ServerEvent.RouterBranchNotFound, request, response);
    } else if (route === null) {
      container.server.emit(ServerEvent.RouterBranchMethodNotAllowed, request, response, branch);
    } else {
      container.server.emit(ServerEvent.RouterFound, request, response);
    }
  }
}
