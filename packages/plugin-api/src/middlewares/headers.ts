import { container } from "@wolfstar/http-framework";
import type { ApiRequest } from "../lib/structures/api/ApiRequest";
import type { ApiResponse } from "../lib/structures/api/ApiResponse";
import { HttpCodes } from "../lib/structures/http/HttpCodes";
import { Middleware } from "../lib/structures/Middleware";
import type { RouterNode } from "../lib/structures/router/RouterNode";
import { isNullish } from "../lib/utils/common";

/**
 * Sets the CORS and `Date` headers, and ends the response early for `OPTIONS` requests, unknown
 * paths (404) and unsupported methods (405).
 */
export class HeadersMiddleware extends Middleware {
  private readonly origin: string;

  public constructor(context: Middleware.LoaderContext) {
    super(context, { position: 10 });
    this.origin = container.server.options.origin ?? "*";
  }

  public override run(request: ApiRequest, response: ApiResponse): void {
    response.setHeader("Date", new Date().toUTCString());
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Origin", this.origin);
    response.setHeader("Access-Control-Allow-Headers", "Authorization, User-Agent, Content-Type");
    response.setHeader("Access-Control-Allow-Methods", this.getMethods(request.routerNode));

    this.ensurePotentialEarlyExit(request, response);
  }

  private getMethods(routerNode: RouterNode | null | undefined): string {
    if (isNullish(routerNode)) return container.server.routes.router.supportedMethods.join(", ");
    return [...routerNode.methods()].join(", ");
  }

  private ensurePotentialEarlyExit(request: ApiRequest, response: ApiResponse): void {
    if (request.method === "OPTIONS" && !request.route?.methods.has("OPTIONS")) {
      response.end();
    } else if (request.routerNode === null) {
      response.status(HttpCodes.NotFound).end();
    } else if (request.route === null) {
      response.status(HttpCodes.MethodNotAllowed).end();
    }
  }
}
